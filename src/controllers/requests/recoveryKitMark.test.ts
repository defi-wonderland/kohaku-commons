import { describe, expect, test } from '@jest/globals'

import { mockWindowManager } from '../../../test/helpers/window'
import { Session } from '../../classes/session'
import { networks } from '../../consts/networks'
import { Account, AccountOnchainState } from '../../interfaces/account'
import { SignUserRequest } from '../../interfaces/userRequest'
import { AccountOpAction } from '../actions/actions'
import { RequestsController } from './requests'

const accountAddr = '0x77777777789A8BBEE6C64381e5E89E501fb0e4c8'
const account: Account = {
  addr: accountAddr,
  associatedKeys: ['0xd6e371526cdaeE04cd8AF225D42e37Bc14688D9E'],
  initialPrivileges: [],
  creation: null,
  preferences: { label: 'Account', pfp: accountAddr }
}
const accountState: AccountOnchainState = {
  accountAddr,
  isDeployed: true,
  eoaNonce: null,
  nonce: 0n,
  erc4337Nonce: 0n,
  associatedKeys: {},
  deployError: false,
  balance: 0n,
  isEOA: false,
  isErc4337Enabled: false,
  isErc4337Nonce: false,
  isV2: true,
  currentBlock: 0n,
  isSmarterEoa: false,
  delegatedContract: null,
  delegatedContractName: null
}
const recoveryKit = {
  manager: '0x1111111111111111111111111111111111111111',
  auditedActions: ['0x2222222222222222222222222222222222222222']
}
const origin = 'https://test-dApp.com'
const session = new Session({ tabId: 1, origin })
const loaded = { initialLoadPromise: Promise.resolve() }

const prepareController = () =>
  new RequestsController({
    relayerUrl: 'https://relayer.test',
    accounts: {
      ...loaded,
      accounts: [account],
      getOrFetchAccountOnChainState: () => Promise.resolve(accountState)
    },
    networks: { ...loaded, networks },
    providers: loaded,
    selectedAccount: { ...loaded, account },
    keystore: { ...loaded, getAccountKeys: () => [] },
    dapps: { ...loaded, getDapp: () => ({ id: session.id, chainId: 1 }) },
    transfer: {},
    swapAndBridge: { activeRoutes: [] },
    windowManager: mockWindowManager().windowManager,
    notificationManager: { create: () => Promise.resolve() },
    getSignAccountOp: () => null,
    updateSignAccountOp: () => {},
    destroySignAccountOp: () => {},
    updateSelectedAccountPortfolio: () => Promise.resolve(),
    addTokensToBeLearned: () => {},
    guardHWSigning: () => Promise.resolve(false)
  } as unknown as ConstructorParameters<typeof RequestsController>[0])

const accountOpOf = (controller: RequestsController) =>
  (controller.actions.actionsQueue.find((a) => a.type === 'accountOp') as AccountOpAction).accountOp

const walletCallsRequest = (id: number, meta: Partial<SignUserRequest['meta']> = {}) =>
  ({
    id,
    action: {
      kind: 'calls',
      calls: [{ to: '0x3333333333333333333333333333333333333333', value: 0n, data: '0x' }]
    },
    session: new Session(),
    meta: { isSignAction: true, accountAddr, chainId: 1n, ...meta }
  } as SignUserRequest)

describe('The recovery kit mark in the request queue', () => {
  test('the op keeps the mark while the marked request is batched and drops it once removed', async () => {
    const controller = prepareController()

    await controller.addUserRequests([walletCallsRequest(1, { recoveryKit })])
    await controller.addUserRequests([walletCallsRequest(2)])
    expect(accountOpOf(controller).calls).toHaveLength(2)
    expect(accountOpOf(controller).meta?.recoveryKit).toEqual(recoveryKit)

    await controller.removeUserRequests([1])
    expect(accountOpOf(controller).calls).toHaveLength(1)
    expect(accountOpOf(controller).meta).not.toHaveProperty('recoveryKit')
  })
})

describe('A dapp calls request', () => {
  test('a wallet_sendCalls payload cannot put the recovery kit on the op', async () => {
    const controller = prepareController()

    await controller.build({
      type: 'dappRequest',
      params: {
        request: {
          method: 'wallet_sendCalls',
          params: [
            {
              version: '2.0.0',
              from: accountAddr,
              chainId: '0x1',
              calls: [{ to: accountAddr, data: '0x', value: '0x0', recoveryKit }],
              capabilities: { recoveryKit },
              meta: { recoveryKit },
              recoveryKit
            }
          ],
          session,
          origin,
          meta: { recoveryKit }
        } as never,
        dappPromise: { resolve: () => {}, reject: () => {}, session }
      }
    })

    expect(controller.userRequests).toHaveLength(1)
    expect(controller.userRequests[0].meta).not.toHaveProperty('recoveryKit')
    expect(accountOpOf(controller).calls).toHaveLength(1)
    expect(accountOpOf(controller).meta).not.toHaveProperty('recoveryKit')
  })

  test('an eth_sendTransaction payload cannot put the recovery kit on the op', async () => {
    const controller = prepareController()

    await controller.build({
      type: 'dappRequest',
      params: {
        request: {
          method: 'eth_sendTransaction',
          params: [{ from: accountAddr, to: accountAddr, data: '0x', value: '0x0', recoveryKit }],
          session,
          origin,
          meta: { recoveryKit }
        } as never,
        dappPromise: { resolve: () => {}, reject: () => {}, session }
      }
    })

    expect(controller.userRequests).toHaveLength(1)
    expect(controller.userRequests[0].meta).not.toHaveProperty('recoveryKit')
    expect(accountOpOf(controller).calls).toHaveLength(1)
    expect(accountOpOf(controller).meta).not.toHaveProperty('recoveryKit')
  })
})
