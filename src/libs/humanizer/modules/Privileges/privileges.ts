import { AbiCoder, getAddress, id, Interface, keccak256, ZeroHash } from 'ethers'

import AmbireAccount from '../../../../../contracts/compiled/AmbireAccount.json'
import { ENTRY_POINT_MARKER } from '../../../../consts/deploy'
import { AccountOp } from '../../../accountOp/accountOp'
import { HumanizerCallModule, HumanizerMeta, IrCall } from '../../interfaces'
import { getAction, getAddressVisualization, getKnownName, getLabel, getWarning } from '../../utils'

const iface = new Interface(AmbireAccount.abi)
const SET_ADDR_PRIVILEGE_SELECTOR = iface.getFunction('setAddrPrivilege')!.selector
// The recovery kit manager's commitSetup(bytes32,uint256,bytes,bytes)
const COMMIT_SETUP_SELECTOR = id('commitSetup(bytes32,uint256,bytes,bytes)').slice(0, 10)
const abiCoder = AbiCoder.defaultAbiCoder()

const isCallTo = (call: Pick<IrCall, 'to'>, addr: string): boolean =>
  !!call.to && call.to.toLowerCase() === addr.toLowerCase()

// The recovery kit grants each audited action a privilege on the account through a call the
// account makes to itself: setAddrPrivilege(slot, value), where the slot is the address taken
// from keccak256(abi.encode("kit", action)) and the value is keccak256(abi.encode(action, "")).
// That exact call is trusted only when the same batch commits the kit's setup on its manager.
const findRecoveryKitAction = (
  accountOp: Pick<AccountOp, 'accountAddr' | 'calls' | 'meta'>,
  call: Pick<IrCall, 'to' | 'data'>
): string | undefined => {
  const recoveryKit = accountOp.meta?.recoveryKit
  if (!recoveryKit || !isCallTo(call, accountOp.accountAddr)) {
    return undefined
  }
  if (!call.data || call.data.slice(0, 10).toLowerCase() !== SET_ADDR_PRIVILEGE_SELECTOR) {
    return undefined
  }
  const commitsSetup = accountOp.calls.some(
    (c) =>
      isCallTo(c, recoveryKit.manager) &&
      !!c.data &&
      c.data.slice(0, 10).toLowerCase() === COMMIT_SETUP_SELECTOR
  )
  if (!commitsSetup) {
    return undefined
  }

  let addr: string
  let priv: string
  try {
    ;[addr, priv] = iface.decodeFunctionData('setAddrPrivilege', call.data)
  } catch {
    return undefined
  }
  return recoveryKit.auditedActions.find((action) => {
    const slot = getAddress(
      `0x${keccak256(abiCoder.encode(['string', 'address'], ['kit', action])).slice(-40)}`
    )
    const value = keccak256(abiCoder.encode(['address', 'string'], [action, '']))
    return getAddress(addr) === slot && priv.toLowerCase() === value
  })
}

export const isRecoveryKitGrant = (
  accountOp: Pick<AccountOp, 'accountAddr' | 'calls' | 'meta'>,
  call: Pick<IrCall, 'to' | 'data'>
): boolean => findRecoveryKitAction(accountOp, call) !== undefined

// Any grant other than the entry point's lets the granted address act as the called account,
// so it is shown as a danger. The call may target another account than the one signing,
// in which case the warning names that account. Warnings earlier modules attached are kept.
const parsePrivilegeCall = (
  accountOp: AccountOp,
  humanizerMeta: HumanizerMeta,
  call: IrCall
): Pick<IrCall, 'fullVisualization' | 'warnings'> => {
  const { addr, priv } = iface.parseTransaction(call)!.args
  if (getKnownName(humanizerMeta, addr)?.includes('entry point') && priv === ENTRY_POINT_MARKER)
    return { fullVisualization: [getAction('Enable'), getAddressVisualization(addr)] }
  if (priv === ZeroHash)
    return {
      fullVisualization: [getAction('Revoke access'), getLabel('of'), getAddressVisualization(addr)]
    }
  return {
    fullVisualization: [
      getAction('Update access status', { warning: true }),
      getLabel('of'),
      getAddressVisualization(addr),
      getLabel('to'),
      priv === '0x0000000000000000000000000000000000000000000000000000000000000001'
        ? getLabel('regular access')
        : getLabel(priv)
    ],
    warnings: [
      ...(call.warnings || []),
      getWarning(
        `This transaction grants control of ${
          !call.to || call.to.toLowerCase() === accountOp.accountAddr.toLowerCase()
            ? 'this account'
            : `the account ${getAddress(call.to)}`
        } to ${getAddress(addr)}!`,
        'danger'
      )
    ]
  }
}

export const privilegeHumanizer: HumanizerCallModule = (
  accountOp: AccountOp,
  irCalls: IrCall[],
  humanizerMeta: HumanizerMeta
) => {
  const newCalls = irCalls.map((call) => {
    const recoveryKitAction = findRecoveryKitAction(accountOp, call)
    if (recoveryKitAction) {
      return {
        ...call,
        fullVisualization: [
          getAction('Enable recovery module'),
          getAddressVisualization(recoveryKitAction)
        ]
      }
    }
    if (call.data.slice(0, 10).toLowerCase() === SET_ADDR_PRIVILEGE_SELECTOR) {
      return {
        ...call,
        ...parsePrivilegeCall(accountOp, humanizerMeta, call)
      }
    }
    return call
  })
  return newCalls
}
