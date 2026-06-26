import {
  AbiCoder,
  Contract,
  getAddress,
  getCreate2Address,
  Interface,
  keccak256,
  toBeHex
} from 'ethers'

import AmbireAccount from '../../../contracts/compiled/AmbireAccount.json'
import { SINGLETON } from '../../consts/deploy'
import { Fetch } from '../../interfaces/fetch'
import { ExternalSignerControllers } from '../../interfaces/keystore'
import { getBaseAccount } from '../../libs/account/getBaseAccount'
import { AccountOp } from '../../libs/accountOp/accountOp'
import { Call } from '../../libs/accountOp/types'
import { getAmbirePaymasterService } from '../../libs/erc7677/erc7677'
import { randomId } from '../../libs/humanizer/utils'
import { relayerCall } from '../../libs/relayerCall/relayerCall'
import { AccountsController } from '../accounts/accounts'
import { ActivityController } from '../activity/activity'
import EventEmitter from '../eventEmitter/eventEmitter'
import { KeystoreController } from '../keystore/keystore'
import { NetworksController } from '../networks/networks'
import { PortfolioController } from '../portfolio/portfolio'
import { ProvidersController } from '../providers/providers'
import { SelectedAccountController } from '../selectedAccount/selectedAccount'
import { SignAccountOpController } from '../signAccountOp/signAccountOp'
import { StorageController } from '../storage/storage'
import {
  ALWAYS_VALID_METHOD,
  AMBIRE_EXECUTOR_ADAPTER,
  RECOVERY_CONTROLLER
} from './recoveryArtifacts'

/**
 * Recovery v0 controller — in-extension Activate / Recover on Sepolia.
 *
 * Proves the REAL, fully in-extension social-recovery path for the Kohaku
 * extension on Sepolia (chainId 11155111), using the wallet's native rails only
 * (no external deploy scripts, no throwaway keys, no separate CREATE2 factory):
 *
 *   ACTIVATE (Account A, signed by A's owner via the real signing pipeline):
 *     ONE AccountOp that (1) deploys our three recovery contracts FROM the
 *     extension via the canonical CREATE2 singleton, (2) binds the controller
 *     into the adapter, and (3) authorizes the adapter as a privileged executor
 *     on A. After Activate, A's recovery rails exist on-chain.
 *
 *   RECOVER (Account B is the selected account; B sends + pays):
 *     ONE AccountOp where B calls `controller.initiateRecovery(newOwner = B, "0x")`,
 *     which drives `controller.executeFromExecutor` -> `adapter.executeBySender` on
 *     A -> `setAddrPrivilege(B, 1)`. Afterwards B controls A.
 *
 * HOW DEPLOY-FROM-EXTENSION WORKS. A {Call} with `to: null` and
 * `data = <creationBytecode + abiEncodedCtorArgs>` is routed by
 * `toSingletonCall()` (libs/accountOp/accountOp.ts) to
 * `SINGLETON.deploy(initCode, salt = bytes32(0))`. SINGLETON is the canonical
 * CREATE2 factory `0xce0042B868300000d44A59004Da54A005ffdcf9f` (live on Sepolia).
 * Because the salt is the constant `0` and the deployer is the constant
 * SINGLETON, every deployed address is fully determined by `keccak256(initCode)`
 * and can be predicted off-chain with {getCreate2Address} BEFORE broadcasting.
 *
 * REAL SIGNING PIPELINE. Unlike the v0 direct-JsonRpcProvider hack this replaces,
 * Activate and Recover go through the production signing path: a {SignAccountOpController}
 * is prepared (mirroring {RailgunController.#initSignAccOp} verbatim, including the
 * exact positional arg order), and the UI fires
 * `MAIN_CONTROLLER_HANDLE_SIGN_AND_BROADCAST_ACCOUNT_OP { updateType: 'Recovery' }`
 * to sign + broadcast. This controller only PREPARES `signAccountOpController`; it
 * never signs or broadcasts itself. Reads (refreshStatus) may stay on the injected
 * provider — only the write/rotation path must go through the real pipeline.
 *
 * POLICY IS STILL v0 (AlwaysValidMethod). Activate/Recover prove the real
 * in-extension deploy + sign + rotate path, not the combinator.
 */

/** Which op the live `signAccountOpController` is preparing. */
export type RecoveryPhase = 'activate' | 'recover'

/** Lifecycle status of the most recent Activate/Recover attempt. */
export type RecoveryStatus =
  | 'initial'
  | 'preparing'
  | 'ready-to-sign'
  | 'broadcasted'
  | 'error'

/**
 * The on-chain recovery wiring deployed during Activate for a single Account A.
 * All three addresses are CREATE2-deterministic from the contract init code and
 * `accountA`, so they are stable and re-derivable. Persisted via StorageController.
 */
export type RecoveryDeploymentRecord = {
  /** The Ambire account Activate ran against (the account to be recovered). */
  accountA: string
  /** The RecoveryController (drives the adapter via executeFromExecutor). */
  controllerAddr: string
  /** The AmbireExecutorAdapter wrapping A (the controller's 7579 target). */
  adapterAddr: string
  /** The trivial v0 recovery policy (AlwaysValidMethod). */
  methodAddr: string
}

/** Sepolia. Hardcoded exactly like the railgun controller. */
const CHAIN_ID = 11155111n

/**
 * The CREATE2 salt the singleton uses on the default deploy path. `toSingletonCall`
 * hardcodes `toBeHex(0, 32)`, so address prediction must use the same constant.
 */
const SINGLETON_SALT = toBeHex(0, 32)

/**
 * The Ambire privilege value that authorizes a key (`bytes32(uint256(1))`).
 * Matches `AmbireExecutorAdapter.PRIV_AUTHORIZED`.
 */
const PRIV_AUTHORIZED = '0x0000000000000000000000000000000000000000000000000000000000000001'

const abiCoder = AbiCoder.defaultAbiCoder()

export class RecoveryController extends EventEmitter {
  #keystore: KeystoreController

  #accounts: AccountsController

  #networks: NetworksController

  #providers: ProvidersController

  #selectedAccount: SelectedAccountController

  #portfolio: PortfolioController

  #activity: ActivityController

  #storage: StorageController

  #externalSignerControllers: ExternalSignerControllers

  #relayerUrl: string

  #fetch: Fetch

  // eslint-disable-next-line @typescript-eslint/ban-types
  #callRelayer: Function

  #signAccountOpSubscriptions: Function[] = []

  #initialPromise: Promise<void> | null = null

  // ── Live signing op (prepared here, signed+broadcast by the UI/MainController) ──
  /** The prepared sign controller for the current Activate/Recover op, or null. */
  signAccountOpController: SignAccountOpController | null = null

  /** Which op `signAccountOpController` is for, or null when idle. */
  phase: RecoveryPhase | null = null

  // ── Persisted deployment record (per Account A) ─────────────────────────────
  /** True once Activate has been broadcast for `accountA`. */
  activated: boolean = false

  /** The account Activate ran against (Account A), or null. */
  accountA: string | null = null

  /** The deployed RecoveryController address (predicted, then confirmed). */
  controllerAddr: string | null = null

  /** The deployed AmbireExecutorAdapter address (predicted, then confirmed). */
  adapterAddr: string | null = null

  /** The deployed AlwaysValidMethod address (predicted, then confirmed). */
  methodAddr: string | null = null

  // ── Recover inputs / status ─────────────────────────────────────────────────
  /** The new owner (Account B). Set before Recover; defaults via the GUI to B. */
  newOwner: string = ''

  status: RecoveryStatus = 'initial'

  /** Broadcast tx hashes, keyed by phase. Captured by MainController post-broadcast. */
  txHashes: { activate?: string; recover?: string } = {}

  lastError: string | null = null

  /** True once `newOwner` holds a non-zero privilege on Account A (post-recovery). */
  newOwnerIsAuthorizedOnA: boolean = false

  chainId: number = Number(CHAIN_ID)

  constructor(
    keystore: KeystoreController,
    accounts: AccountsController,
    networks: NetworksController,
    providers: ProvidersController,
    selectedAccount: SelectedAccountController,
    portfolio: PortfolioController,
    activity: ActivityController,
    storage: StorageController,
    externalSignerControllers: ExternalSignerControllers,
    relayerUrl: string,
    fetch: Fetch
  ) {
    super()

    this.#keystore = keystore
    this.#accounts = accounts
    this.#networks = networks
    this.#providers = providers
    this.#selectedAccount = selectedAccount
    this.#portfolio = portfolio
    this.#activity = activity
    this.#storage = storage
    this.#externalSignerControllers = externalSignerControllers
    this.#relayerUrl = relayerUrl
    this.#fetch = fetch

    // Needed for the Ambire paymaster sponsorship lookup (mirrors railgun).
    this.#callRelayer = relayerCall.bind({ url: relayerUrl, fetch })

    this.#initialPromise = this.#load()

    this.emitUpdate()
  }

  /**
   * Wait for the selected account to load, then hydrate any persisted deployment
   * record for the currently-selected account so the GUI can resume an Activate'd A.
   */
  async #load() {
    await this.#selectedAccount?.initialLoadPromise
    await this.#hydrateForSelectedAccount()
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PERSISTENCE (StorageController)
  // ──────────────────────────────────────────────────────────────────────────

  /** Storage key for the deployment record of a given Account A. */
  #deploymentKey(accountA: string): string {
    return `recovery:deployment:${getAddress(accountA)}:${this.chainId}`
  }

  /** Global "most recent Activate" key, readable from ANY selected account so the
   *  new owner (Account B) can see Account A's controller when running Recover. */
  #lastDeploymentKey(): string {
    return `recovery:lastDeployment:${this.chainId}`
  }

  /**
   * Hydrate `activated` + the three addresses for the currently-selected account.
   * Resolution order:
   *   1. a per-account record keyed by the selected account (the recovered Account A), else
   *   2. the global last-deployment record (so a DIFFERENT selected account — the
   *      new owner B — can still target A's controller during Recover), else
   *   3. clear, so switching to an unrelated account shows the un-activated state.
   */
  async #hydrateForSelectedAccount() {
    const selected = this.#selectedAccount?.account?.addr
    if (!selected) return

    const own = await this.#storage.get(
      this.#deploymentKey(selected),
      null as RecoveryDeploymentRecord | null
    )
    const record =
      own ||
      (await this.#storage.get(
        this.#lastDeploymentKey(),
        null as RecoveryDeploymentRecord | null
      ))

    if (record) {
      this.activated = true
      this.accountA = record.accountA
      this.controllerAddr = record.controllerAddr
      this.adapterAddr = record.adapterAddr
      this.methodAddr = record.methodAddr
    } else {
      // No record for this account (and no global one) — show un-activated state.
      this.activated = false
      this.accountA = null
      this.controllerAddr = null
      this.adapterAddr = null
      this.methodAddr = null
    }

    this.emitUpdate()
  }

  /**
   * Persist the deployment record produced by Activate. Called by MainController
   * after the Activate op is broadcast (so addresses are only persisted once the
   * deploy is actually on its way to chain).
   */
  async persistDeployment(): Promise<void> {
    if (!this.accountA || !this.controllerAddr || !this.adapterAddr || !this.methodAddr) return

    const record: RecoveryDeploymentRecord = {
      accountA: this.accountA,
      controllerAddr: this.controllerAddr,
      adapterAddr: this.adapterAddr,
      methodAddr: this.methodAddr
    }
    // Per-account record (so Account A sees its own activation) AND a global
    // last-deployment record (so the new owner B, a different selected account,
    // can resolve A's controller when running Recover). See #hydrateForSelectedAccount.
    await this.#storage.set(this.#deploymentKey(this.accountA), record)
    await this.#storage.set(this.#lastDeploymentKey(), record)
    this.emitUpdate()
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CREATE2 PREDICTION (resolves the adapter <-> controller circular ctor dep)
  // ──────────────────────────────────────────────────────────────────────────

  /** Predict the CREATE2 address the singleton would deploy `initCode` to. */
  #predict(initCode: string): string {
    return getCreate2Address(SINGLETON, SINGLETON_SALT, keccak256(initCode))
  }

  /**
   * Compute the full deployment for Account A as a forward chain (no cycle):
   *   1. method     — no ctor args, address known immediately.
   *   2. adapter(A) — ctor takes ONLY the Ambire account, so its address is known
   *                   without the controller address (the controller is bound later
   *                   via `setController`). This is what breaks the circularity.
   *   3. controller(adapter, method) — both args now known.
   *
   * Returns the predicted addresses plus the three init-code blobs used as the
   * `to: null` deploy Call data.
   *
   * @param accountA The Ambire account to be recovered (the selected account).
   */
  #computeDeployment(accountA: string): {
    methodAddr: string
    adapterAddr: string
    controllerAddr: string
    methodInit: string
    adapterInit: string
    controllerInit: string
  } {
    const A = getAddress(accountA)

    // 1. AlwaysValidMethod — no constructor args.
    const methodInit = ALWAYS_VALID_METHOD.bytecode
    const methodAddr = this.#predict(methodInit)

    // 2. AmbireExecutorAdapter(A) — POST-edit ctor takes only `_ambireAccount`.
    const adapterInit =
      AMBIRE_EXECUTOR_ADAPTER.bytecode + abiCoder.encode(['address'], [A]).slice(2)
    const adapterAddr = this.#predict(adapterInit)

    // 3. RecoveryController(adapterAddr, methodAddr).
    const controllerInit =
      RECOVERY_CONTROLLER.bytecode +
      abiCoder.encode(['address', 'address'], [adapterAddr, methodAddr]).slice(2)
    const controllerAddr = this.#predict(controllerInit)

    return { methodAddr, adapterAddr, controllerAddr, methodInit, adapterInit, controllerInit }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // REAL SIGNING PIPELINE (mirrors RailgunController.#initSignAccOp verbatim)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Build an AccountOp for `calls` on the selected account and prepare a
   * {SignAccountOpController}. The arg order is COPIED VERBATIM from
   * {RailgunController.#initSignAccOp} — it is positional and must not change.
   * The UI signs + broadcasts via MainController afterwards.
   *
   * @param calls The batch this op submits.
   * @param phase Which recovery op these calls represent.
   */
  async #initSignAccOp(calls: Call[], phase: RecoveryPhase): Promise<void> {
    if (!this.#selectedAccount?.account || this.signAccountOpController) return

    const network = this.#networks.networks.find((net) => net.chainId === CHAIN_ID)
    if (!network) {
      this.status = 'error'
      this.lastError = 'Sepolia network is not registered in the wallet.'
      this.emitUpdate()
      return
    }

    const provider = this.#providers.providers[network.chainId.toString()]
    const accountState = await this.#accounts.getOrFetchAccountOnChainState(
      this.#selectedAccount.account.addr,
      network.chainId
    )

    const baseAcc = getBaseAccount(
      this.#selectedAccount.account,
      accountState,
      this.#keystore.getAccountKeys(this.#selectedAccount.account),
      network
    )

    const accountOp: AccountOp = {
      accountAddr: this.#selectedAccount.account.addr,
      chainId: network.chainId,
      signingKeyAddr: null,
      signingKeyType: null,
      gasLimit: null,
      gasFeePayment: null,
      nonce: accountState.nonce,
      signature: null,
      accountOpToExecuteBefore: null,
      calls,
      meta: {
        paymasterService: getAmbirePaymasterService(baseAcc, this.#relayerUrl)
      }
    }

    this.signAccountOpController = new SignAccountOpController(
      this.#accounts,
      this.#networks,
      this.#keystore,
      this.#portfolio,
      this.#activity,
      this.#externalSignerControllers,
      this.#selectedAccount.account,
      network,
      provider,
      randomId(),
      accountOp,
      () => true,
      false,
      undefined
    )

    this.phase = phase
    this.status = 'ready-to-sign'

    this.#signAccountOpSubscriptions.push(
      this.signAccountOpController.onUpdate(() => {
        this.emitUpdate()
      })
    )
    this.#signAccountOpSubscriptions.push(
      this.signAccountOpController.onError((error) => {
        if (this.signAccountOpController)
          this.#portfolio.overridePendingResults(this.signAccountOpController.accountOp)
        this.emitError(error)
      })
    )

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.signAccountOpController.estimate()

    this.emitUpdate()
  }

  /** Tear down the live sign controller + its subscriptions (mirrors railgun). */
  destroySignAccountOp() {
    this.#signAccountOpSubscriptions.forEach((unsubscribe) => unsubscribe())
    this.#signAccountOpSubscriptions = []

    if (this.signAccountOpController) {
      this.signAccountOpController.reset()
      this.signAccountOpController = null
    }

    this.phase = null
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Set the new owner (Account B). Stored verbatim; validated when Recover runs.
   */
  setNewOwner(addr: string) {
    this.newOwner = addr
    this.emitUpdate()
  }

  /**
   * ACTIVATE recovery on the currently-selected account (Account A).
   *
   * Predicts the three CREATE2 addresses, stores them in state, and prepares the
   * signing op for the 5-call batch:
   *   1. deploy AlwaysValidMethod          (to: null)
   *   2. deploy AmbireExecutorAdapter(A)   (to: null)
   *   3. deploy RecoveryController(adapter, method) (to: null)
   *   4. adapter.setController(controller) (one-time bind; resolves the ctor cycle)
   *   5. A.setAddrPrivilege(adapter, 1)    (A self-call; authorizes the executor)
   *
   * The op is signed by A's owner via the UI/MainController.
   */
  async activate(): Promise<void> {
    await this.#initialPromise

    const account = this.#selectedAccount?.account
    if (!account) {
      this.status = 'error'
      this.lastError = 'No account selected to activate recovery on.'
      this.emitUpdate()
      return
    }

    this.destroySignAccountOp()
    this.status = 'preparing'
    this.lastError = null
    this.emitUpdate()

    const A = getAddress(account.addr)
    const { methodAddr, adapterAddr, controllerAddr, methodInit, adapterInit, controllerInit } =
      this.#computeDeployment(A)

    // Record predicted wiring up front (persisted post-broadcast by MainController).
    this.accountA = A
    this.methodAddr = methodAddr
    this.adapterAddr = adapterAddr
    this.controllerAddr = controllerAddr

    const adapterIface = new Interface(AMBIRE_EXECUTOR_ADAPTER.abi as any)
    const ambireIface = new Interface(AmbireAccount.abi)

    const calls: Call[] = [
      // 1-3: deploy via the CREATE2 singleton (to: null is routed by toSingletonCall).
      { to: null as unknown as string, value: 0n, data: methodInit },
      { to: null as unknown as string, value: 0n, data: adapterInit },
      { to: null as unknown as string, value: 0n, data: controllerInit },
      // 4: bind the controller into the adapter (one-time; closes the ctor cycle).
      {
        to: adapterAddr,
        value: 0n,
        data: adapterIface.encodeFunctionData('setController', [controllerAddr])
      },
      // 5: authorize the adapter as a privileged executor on A (A self-call in its batch).
      {
        to: A,
        value: 0n,
        data: ambireIface.encodeFunctionData('setAddrPrivilege', [adapterAddr, PRIV_AUTHORIZED])
      }
    ]

    await this.#initSignAccOp(calls, 'activate')
  }

  /**
   * RECOVER — run from the currently-selected account (Account B), which sends
   * and pays. Requires an Activate'd deployment (`controllerAddr`) and a valid
   * `newOwner` (Account B). Prepares the single-call op:
   *   controller.initiateRecovery(newOwner, "0x")
   * which rotates Account A's controlling signer to `newOwner`.
   */
  async recover(): Promise<void> {
    await this.#initialPromise

    if (!this.#selectedAccount?.account) {
      this.status = 'error'
      this.lastError = 'No account selected to send the recovery from.'
      this.emitUpdate()
      return
    }

    if (!this.controllerAddr) {
      this.status = 'error'
      this.lastError = 'Recovery is not activated. Run Activate on Account A first.'
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

    this.destroySignAccountOp()
    this.status = 'preparing'
    this.lastError = null
    this.emitUpdate()

    const controllerIface = new Interface(RECOVERY_CONTROLLER.abi as any)
    const calls: Call[] = [
      {
        to: this.controllerAddr,
        value: 0n,
        data: controllerIface.encodeFunctionData('initiateRecovery', [checksummedNewOwner, '0x'])
      }
    ]

    await this.#initSignAccOp(calls, 'recover')
  }

  /**
   * Read Account A's privilege for `newOwner` directly from the injected Sepolia
   * provider and update `newOwnerIsAuthorizedOnA`. Read-only, so it may bypass the
   * signing pipeline (only the rotation/write path must go through it).
   */
  async refreshStatus(): Promise<void> {
    const A = this.accountA
    if (!A || !this.newOwner) {
      this.newOwnerIsAuthorizedOnA = false
      this.emitUpdate()
      return
    }

    try {
      const provider = this.#providers.providers[this.chainId.toString()]
      if (!provider) return

      const account = new Contract(A, AmbireAccount.abi, provider as any)
      const priv: string = await account.privileges(getAddress(this.newOwner))
      this.newOwnerIsAuthorizedOnA = BigInt(priv) !== 0n
      this.emitUpdate()
    } catch (error: any) {
      this.emitError({
        message: 'Failed to read recovery status from Sepolia.',
        level: 'minor',
        error: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  toJSON() {
    return {
      ...super.toJSON(),
      chainId: this.chainId,
      activated: this.activated,
      accountA: this.accountA,
      controllerAddr: this.controllerAddr,
      adapterAddr: this.adapterAddr,
      methodAddr: this.methodAddr,
      newOwner: this.newOwner,
      status: this.status,
      phase: this.phase,
      txHashes: this.txHashes,
      lastError: this.lastError,
      newOwnerIsAuthorizedOnA: this.newOwnerIsAuthorizedOnA
    }
  }
}
