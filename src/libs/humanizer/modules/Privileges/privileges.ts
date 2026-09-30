import { getAddress, Interface, ZeroHash } from 'ethers'

import AmbireAccount from '../../../../../contracts/compiled/AmbireAccount.json'
import { ENTRY_POINT_MARKER } from '../../../../consts/deploy'
import { AccountOp } from '../../../accountOp/accountOp'
import { HumanizerCallModule, HumanizerMeta, IrCall } from '../../interfaces'
import { getAction, getAddressVisualization, getKnownName, getLabel, getWarning } from '../../utils'

const iface = new Interface(AmbireAccount.abi)
const SET_ADDR_PRIVILEGE_SELECTOR = iface.getFunction('setAddrPrivilege')!.selector

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
