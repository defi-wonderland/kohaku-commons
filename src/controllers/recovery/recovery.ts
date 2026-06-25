import { Contract, getAddress, JsonRpcProvider, Wallet } from 'ethers'

import EventEmitter from '../eventEmitter/eventEmitter'
import { NetworksController } from '../networks/networks'
import { ProvidersController } from '../providers/providers'

/**
 * Recovery v0 controller.
 *
 * Proves the END-TO-END social-recovery path for the Kohaku extension:
 *   GUI -> this controller -> RecoveryController.initiateRecovery (a real ERC-7579
 *   executor) -> account signer rotation on a local anvil chain (chainId 31337).
 *
 * It deliberately does NOT implement the real recovery policy/combinator. The
 * on-chain policy is trivial for v0 (AlwaysValidMethod). What this controller
 * demonstrates is that ONE on-chain controller binary, driven from the extension,
 * rotates the signer on TWO targets that both expose the ERC-7579 executor surface:
 *   - 'native': a minimal ERC-7579 reference account (real executeFromExecutor), and
 *   - 'ambire': the Ambire account behind a thin 7579->executeBySender adapter.
 *
 * Reach-anvil decision (documented): DIRECT PROVIDER + DEMO RELAYER SIGNER.
 * The rotation is, by design, a plain EOA-sent transaction to
 * `controller.initiateRecovery(newOwner, proof)` that needs NO owner signature
 * (the on-chain controller is an authorized 7579 executor / Ambire-privileged
 * executor). Therefore there is no need for SignAccountOpController / UserOp /
 * paymaster / relayer-URL machinery. We send the tx with an `ethers.Wallet`
 * built from the demo relayer key in the deploy JSON, over the injected
 * `RPCProvider['31337']` when present, falling back to a fresh
 * `JsonRpcProvider(deployment.rpcUrl)`. This is the SIMPLEST correct path for v0.
 */

/** Which deployed target the controller drives. */
export type RecoveryTarget = 'native' | 'ambire'

/** Lifecycle status of the most recent recovery attempt. */
export type RecoveryStatus = 'initial' | 'sending' | 'mined' | 'error'

/** Addresses for the native ERC-7579 reference deployment. */
export type RecoveryNativeAddresses = {
  /** The minimal ERC-7579 account whose `owner` gets rotated. */
  account: string
  /** The RecoveryController installed as a type-2 executor on `account`. */
  controller: string
  /** The trivial v0 recovery method (AlwaysValidMethod). */
  method: string
}

/** Addresses for the Ambire deployment (account + 7579 adapter). */
export type RecoveryAmbireAddresses = {
  /** The real Ambire account whose privileges get updated. */
  account: string
  /** The 7579->executeBySender adapter (the controller's IERC7579Account target). */
  adapter: string
  /** The RecoveryController bound to `adapter`. */
  controller: string
  /** The trivial v0 recovery method (AlwaysValidMethod). */
  method: string
}

/**
 * One full recovery wiring. Mirrors the deploy step's
 * `deployments/anvil-v0.json` shape verbatim so the GUI can paste/import it
 * unchanged. Contains NO secrets beyond the well-known anvil demo relayer key.
 */
export type RecoveryDeployment = {
  chainId: number
  rpcUrl: string
  /** Demo relayer private key (anvil key #0). Anvil-only; never a real secret. */
  relayerPrivateKey: string
  /** Convenience hints emitted by the deploy step (not used for rotation). */
  demoOwner?: string
  newOwnerHint?: string
  native: RecoveryNativeAddresses
  ambire: RecoveryAmbireAddresses
}

const RECOVERY_CONTROLLER_ABI = [
  'function initiateRecovery(address newOwner, bytes proof) external',
  'function recoveryNonce(address) view returns (uint256)'
]
const MINIMAL_ACCOUNT_ABI = ['function owner() view returns (address)']
const AMBIRE_ABI = ['function privileges(address) view returns (bytes32)']

const ANVIL_CHAIN_ID = 31337

export class RecoveryController extends EventEmitter {
  #networks: NetworksController

  #providers: ProvidersController

  // ── Config (loaded by the GUI) ──────────────────────────────────────────────
  /** The loaded deploy wiring, or null until `setup` is called. */
  deployment: RecoveryDeployment | null = null

  /** Which target the rotation is driven against. */
  selectedTarget: RecoveryTarget = 'native'

  /** The address to grant signing authority to (GUI input). */
  newOwner: string = ''

  // ── Status (read by the GUI) ────────────────────────────────────────────────
  status: RecoveryStatus = 'initial'

  lastTxHash: string | null = null

  lastError: string | null = null

  /** Current signer of the selected target read from chain (native only). */
  currentOwner: string | null = null

  /** True once `newOwner` is the authorized signer on-chain (post-recovery). */
  newOwnerIsAuthorized: boolean = false

  constructor(networks: NetworksController, providers: ProvidersController) {
    super()

    this.#networks = networks
    this.#providers = providers

    this.emitUpdate()
  }

  /** True once a deploy wiring has been loaded. */
  get configured(): boolean {
    return !!this.deployment
  }

  /** The account being recovered for the selected target, or null. */
  get targetAccount(): string | null {
    if (!this.deployment) return null
    return this.deployment[this.selectedTarget].account
  }

  /** The on-chain RecoveryController address for the selected target, or null. */
  get controllerAddress(): string | null {
    if (!this.deployment) return null
    return this.deployment[this.selectedTarget].controller
  }

  /**
   * Load a deploy wiring (pasted/imported by the GUI) and pick a target.
   * Resets the transient status and kicks off a status refresh.
   */
  setup(deployment: RecoveryDeployment, target: RecoveryTarget = 'native') {
    this.deployment = deployment
    this.selectedTarget = target
    this.status = 'initial'
    this.lastTxHash = null
    this.lastError = null
    this.currentOwner = null
    this.newOwnerIsAuthorized = false
    this.emitUpdate()

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.refreshStatus()
  }

  /** Switch which target (native / ambire) the rotation drives. */
  selectTarget(target: RecoveryTarget) {
    this.selectedTarget = target
    this.currentOwner = null
    this.newOwnerIsAuthorized = false
    this.emitUpdate()

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.refreshStatus()
  }

  /** Set the new owner address (GUI input). Stored verbatim; validated on send. */
  setNewOwner(addr: string) {
    this.newOwner = addr
    this.emitUpdate()
  }

  /**
   * Resolve a provider for the anvil chain. Prefers the injected RPCProvider
   * for chainId 31337 (if the Local Anvil network is registered); otherwise
   * builds a fresh JsonRpcProvider from the deployment's rpcUrl. The fallback
   * means v0 works WITHOUT registering the anvil network in consts.
   */
  #getProvider(): JsonRpcProvider {
    const injected = this.#providers.providers[ANVIL_CHAIN_ID.toString()]
    // Only use the injected provider if its network actually matches the deploy
    // chain; otherwise fall back to the deployment's own RPC URL.
    const isAnvilRegistered = this.#networks.networks.some(
      (net) => net.chainId === BigInt(ANVIL_CHAIN_ID)
    )
    if (injected && isAnvilRegistered) return injected as unknown as JsonRpcProvider

    return new JsonRpcProvider(this.deployment!.rpcUrl)
  }

  /**
   * Read the current signer state for the selected target and update
   * `currentOwner` / `newOwnerIsAuthorized`.
   * - native: reads `account.owner()`.
   * - ambire: reads `account.privileges(newOwner)` (non-zero == authorized).
   */
  async refreshStatus(): Promise<void> {
    if (!this.deployment) return

    try {
      const provider = this.#getProvider()

      if (this.selectedTarget === 'native') {
        const account = new Contract(this.deployment.native.account, MINIMAL_ACCOUNT_ABI, provider)
        const owner: string = await account.owner()
        this.currentOwner = owner
        this.newOwnerIsAuthorized = this.newOwner
          ? getAddress(owner) === getAddress(this.newOwner)
          : false
      } else {
        // Ambire authority lives in the privileges mapping; there is no single
        // `owner()`, so we only report whether the new owner is authorized.
        this.currentOwner = null
        const account = new Contract(this.deployment.ambire.account, AMBIRE_ABI, provider)
        if (this.newOwner) {
          const priv: string = await account.privileges(getAddress(this.newOwner))
          this.newOwnerIsAuthorized = BigInt(priv) !== 0n
        } else {
          this.newOwnerIsAuthorized = false
        }
      }

      this.emitUpdate()
    } catch (error: any) {
      this.emitError({
        message: 'Failed to read recovery status from the chain. Is anvil running?',
        level: 'minor',
        error: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * Send `controller.initiateRecovery(newOwner, '0x')` from the demo relayer
   * signer and wait for it to mine. On success, refreshes the on-chain status
   * so the GUI can show the rotated signer.
   */
  async initiateRecovery(): Promise<void> {
    if (!this.deployment || !this.controllerAddress) {
      this.status = 'error'
      this.lastError = 'Recovery is not configured. Load the deploy JSON first.'
      this.emitUpdate()
      return
    }

    let checksummedNewOwner: string
    try {
      checksummedNewOwner = getAddress(this.newOwner)
    } catch {
      this.status = 'error'
      this.lastError = 'Invalid new owner address.'
      this.emitUpdate()
      return
    }

    try {
      this.status = 'sending'
      this.lastError = null
      this.lastTxHash = null
      this.emitUpdate()

      const provider = this.#getProvider()
      const signer = new Wallet(this.deployment.relayerPrivateKey, provider)
      const controller = new Contract(this.controllerAddress, RECOVERY_CONTROLLER_ABI, signer)

      const tx = await controller.initiateRecovery(checksummedNewOwner, '0x')
      this.lastTxHash = tx.hash
      this.emitUpdate()

      await tx.wait()
      this.status = 'mined'
      this.emitUpdate()

      await this.refreshStatus()
    } catch (error: any) {
      this.status = 'error'
      this.lastError = error?.shortMessage || error?.message || String(error)
      this.emitUpdate()
    }
  }

  toJSON() {
    return {
      ...this,
      // Include getters so the stringified instance the GUI receives is complete.
      configured: this.configured,
      targetAccount: this.targetAccount,
      controllerAddress: this.controllerAddress
    }
  }
}
