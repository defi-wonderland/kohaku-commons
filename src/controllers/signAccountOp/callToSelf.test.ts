import { AbiCoder, Interface, ZeroHash } from 'ethers'

import { describe, expect, test } from '@jest/globals'

import AmbireAccount from '../../../contracts/compiled/AmbireAccount.json'
import { isRefusedCallToSelf } from './signAccountOp'

const accountAddr = '0x77777777789A8BBEE6C64381e5E89E501fb0e4c8'
const otherAddr = '0x6969174FD72466430a46e18234D0b530c9FD5f49'
const ambireAccount = new Interface(AmbireAccount.abi)

const grantPrivilegeData = ambireAccount.encodeFunctionData('setAddrPrivilege', [
  otherAddr,
  AbiCoder.defaultAbiCoder().encode(['uint256'], [2])
])

describe('Calls to the account itself', () => {
  test('a privilege grant on the account itself is allowed', () => {
    expect(
      isRefusedCallToSelf({ to: accountAddr, value: 0n, data: grantPrivilegeData }, accountAddr)
    ).toBe(false)
  })

  test('a privilege grant is recognised whatever the address and data casing', () => {
    const upperCaseData = `0x${grantPrivilegeData.slice(2).toUpperCase()}`
    expect(
      isRefusedCallToSelf(
        { to: accountAddr.toLowerCase(), value: 0n, data: upperCaseData },
        accountAddr
      )
    ).toBe(false)
  })

  test('any other call to the account itself is refused', () => {
    const executeBySelfData = ambireAccount.encodeFunctionData('executeBySelf', [
      [[otherAddr, 0n, '0x']]
    ])
    expect(
      isRefusedCallToSelf({ to: accountAddr, value: 0n, data: executeBySelfData }, accountAddr)
    ).toBe(true)
    expect(isRefusedCallToSelf({ to: accountAddr, value: 1n, data: '0x' }, accountAddr)).toBe(true)
    expect(isRefusedCallToSelf({ to: accountAddr, value: 0n, data: ZeroHash }, accountAddr)).toBe(
      true
    )
  })

  test('a call to another address is left to the other checks', () => {
    expect(
      isRefusedCallToSelf({ to: otherAddr, value: 0n, data: grantPrivilegeData }, accountAddr)
    ).toBe(false)
    expect(isRefusedCallToSelf({ to: otherAddr, value: 0n, data: '0x' }, accountAddr)).toBe(false)
  })
})
