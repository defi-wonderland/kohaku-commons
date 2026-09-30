import { AbiCoder, getAddress, id, Interface, keccak256, ZeroHash } from 'ethers'

import { describe, expect, test } from '@jest/globals'

import AmbireAccount from '../../../contracts/compiled/AmbireAccount.json'
import { AccountOp } from '../../libs/accountOp/accountOp'
import { isRefusedCallToSelf } from './signAccountOp'

const accountAddr = '0x77777777789A8BBEE6C64381e5E89E501fb0e4c8'
const otherAddr = '0x6969174FD72466430a46e18234D0b530c9FD5f49'
const manager = '0x1111111111111111111111111111111111111111'
const auditedAction = '0x2222222222222222222222222222222222222222'
const unlistedAction = '0x3333333333333333333333333333333333333333'
const ambireAccount = new Interface(AmbireAccount.abi)
const abiCoder = AbiCoder.defaultAbiCoder()

const kitSlot = (action: string) =>
  getAddress(`0x${keccak256(abiCoder.encode(['string', 'address'], ['kit', action])).slice(-40)}`)
const kitValue = (action: string) => keccak256(abiCoder.encode(['address', 'string'], [action, '']))
const grantData = (slot: string, value: string) =>
  ambireAccount.encodeFunctionData('setAddrPrivilege', [slot, value])

const kitGrant = {
  to: accountAddr,
  value: 0n,
  data: grantData(kitSlot(auditedAction), kitValue(auditedAction))
}
const commitSetup = {
  to: manager,
  value: 0n,
  data: `${id('commitSetup(bytes32,uint256,bytes,bytes)').slice(0, 10)}${'00'.repeat(32)}`
}
const recoveryKit = { manager, auditedActions: [auditedAction] }

const opWith = (
  calls: AccountOp['calls'],
  meta: AccountOp['meta'] = { recoveryKit }
): Pick<AccountOp, 'accountAddr' | 'calls' | 'meta'> => ({ accountAddr, calls, meta })

describe('Calls to the account itself', () => {
  test('the kit grant to an audited action beside its commitSetup is allowed', () => {
    expect(isRefusedCallToSelf(kitGrant, opWith([commitSetup, kitGrant]))).toBe(false)
  })

  test('the kit grant is recognised whatever the address and data casing', () => {
    const upperCaseGrant = {
      to: accountAddr.toLowerCase(),
      value: 0n,
      data: `0x${kitGrant.data.slice(2).toUpperCase()}`
    }
    expect(
      isRefusedCallToSelf(
        upperCaseGrant,
        opWith([{ ...commitSetup, to: manager.toUpperCase() }, upperCaseGrant])
      )
    ).toBe(false)
  })

  test('the kit grant without commitSetup in the batch is refused', () => {
    expect(isRefusedCallToSelf(kitGrant, opWith([kitGrant]))).toBe(true)
  })

  test('the kit grant with commitSetup sent to another address than the manager is refused', () => {
    const misdirected = { ...commitSetup, to: otherAddr }
    expect(isRefusedCallToSelf(kitGrant, opWith([misdirected, kitGrant]))).toBe(true)
  })

  test('the kit grant to an action that is not audited is refused', () => {
    const unlistedGrant = {
      to: accountAddr,
      value: 0n,
      data: grantData(kitSlot(unlistedAction), kitValue(unlistedAction))
    }
    expect(isRefusedCallToSelf(unlistedGrant, opWith([commitSetup, unlistedGrant]))).toBe(true)
  })

  test('the kit slot of an audited action with another value is refused', () => {
    const wrongValues = [kitValue(unlistedAction), abiCoder.encode(['uint256'], [1]), ZeroHash]
    wrongValues.forEach((value) => {
      const grant = { to: accountAddr, value: 0n, data: grantData(kitSlot(auditedAction), value) }
      expect(isRefusedCallToSelf(grant, opWith([commitSetup, grant]))).toBe(true)
    })
  })

  test('the kit grant without the recovery kit on the op is refused', () => {
    expect(isRefusedCallToSelf(kitGrant, { accountAddr, calls: [commitSetup, kitGrant] })).toBe(
      true
    )
    expect(isRefusedCallToSelf(kitGrant, opWith([commitSetup, kitGrant], {}))).toBe(true)
  })

  test('a privilege grant to another address on the account itself is refused', () => {
    const strangerGrant = {
      to: accountAddr,
      value: 0n,
      data: grantData(otherAddr, abiCoder.encode(['uint256'], [2]))
    }
    expect(isRefusedCallToSelf(strangerGrant, opWith([commitSetup, strangerGrant]))).toBe(true)
  })

  test('any other call to the account itself is refused', () => {
    const executeBySelfData = ambireAccount.encodeFunctionData('executeBySelf', [
      [[otherAddr, 0n, '0x']]
    ])
    const op = opWith([commitSetup, kitGrant])
    expect(isRefusedCallToSelf({ to: accountAddr, value: 0n, data: executeBySelfData }, op)).toBe(
      true
    )
    expect(isRefusedCallToSelf({ to: accountAddr, value: 1n, data: '0x' }, op)).toBe(true)
    expect(isRefusedCallToSelf({ to: accountAddr, value: 0n, data: ZeroHash }, op)).toBe(true)
  })

  test('a call to another address is left to the other checks', () => {
    const op = opWith([commitSetup, kitGrant])
    expect(isRefusedCallToSelf({ ...kitGrant, to: otherAddr }, op)).toBe(false)
    expect(isRefusedCallToSelf({ to: otherAddr, value: 0n, data: '0x' }, op)).toBe(false)
  })
})
