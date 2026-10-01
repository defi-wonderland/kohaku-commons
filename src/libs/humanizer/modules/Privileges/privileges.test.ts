import { AbiCoder, getAddress, id, Interface, keccak256 } from 'ethers'

import { expect } from '@jest/globals'

import AmbireAccount from '../../../../../contracts/compiled/AmbireAccount.json'
import { ENTRY_POINT_MARKER } from '../../../../consts/deploy'
import humanizerInfo from '../../../../consts/humanizer/humanizerInfo.json'
import { AccountOp } from '../../../accountOp/accountOp'
import { Call } from '../../../accountOp/types'
import { HumanizerMeta, HumanizerVisualization, IrCall } from '../../interfaces'
import { isRecoveryKitGrant, privilegeHumanizer } from './privileges'

const transactions: { [key: string]: Call[] } = {
  privileges: [
    {
      to: '0xB674F3fd5F43464dB0448a57529eAF37F04cceA5',
      value: 0n,
      data: '0x0d5828d40000000000000000000000005ff137d4b0fdcd49dca30c7cf57e578a026d27890000000000000000000000000000000000000000000000000000000000007171'
    },
    {
      to: '0xB674F3fd5F43464dB0448a57529eAF37F04cceA5',
      value: 0n,
      data: '0x0d5828d40000000000000000000000006969174FD72466430a46e18234D0b530c9FD5f490000000000000000000000000000000000000000000000000000000000000001'
    },
    {
      to: '0xB674F3fd5F43464dB0448a57529eAF37F04cceA5',
      value: 0n,
      data: '0x0d5828d40000000000000000000000006969174FD72466430a46e18234D0b530c9FD5f490000000000000000000000000000000000000000000000000000000000000000'
    }
  ]
}

describe('privileges', () => {
  const accountOp: AccountOp = {
    accountAddr: '0xB674F3fd5F43464dB0448a57529eAF37F04cceA5',
    chainId: 1n,
    // chainId: 137n,
    // this may not be defined, in case the user has not picked a key yet
    signingKeyAddr: null,
    signingKeyType: null,
    // this may not be set in case we haven't set it yet
    nonce: null,
    calls: [],
    gasLimit: null,
    signature: null,
    gasFeePayment: null,
    // This is used when we have an account recovery to finalize before executing the AccountOp,
    // And we set this to the recovery finalization AccountOp; could be used in other scenarios too in the future,
    // for example account migration (from v1 QuickAcc to v2)
    accountOpToExecuteBefore: null
    // This is fed into the humanizer to help visualize the accountOp
    // This can contain info like the value of specific share tokens at the time of signing,
    // or any other data that needs to otherwise be retrieved in an async manner and/or needs to be
    // "remembered" at the time of signing in order to visualize history properly
    // humanizerMeta: {}
  }

  test('Privilege Humanizer', async () => {
    const expectedHumanization: Partial<HumanizerVisualization>[][] = [
      [
        { type: 'action', content: 'Enable' },
        {
          type: 'address',
          address: '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789'
        }
      ],
      [
        { type: 'action', content: 'Update access status' },
        { type: 'label', content: 'of' },
        {
          type: 'address',
          address: '0x6969174fd72466430a46e18234d0b530c9fd5f49'
        },
        { type: 'label', content: 'to' },
        {
          type: 'label',
          content: 'regular access'
        }
      ],
      [
        { type: 'action', content: 'Revoke access' },
        { type: 'label', content: 'of' },
        {
          type: 'address',
          address: '0x6969174fd72466430a46e18234d0b530c9fd5f49'
        }
      ]
    ]
    accountOp.calls = [...transactions.privileges]
    let irCalls: IrCall[] = accountOp.calls
    irCalls = privilegeHumanizer(accountOp, irCalls, humanizerInfo as HumanizerMeta)

    expect(irCalls.length).toBe(expectedHumanization.length)
    expectedHumanization.forEach(
      (callHumanization: Partial<HumanizerVisualization>[], i: number) => {
        callHumanization.forEach((h: Partial<HumanizerVisualization>, j: number) =>
          expect(irCalls[i]?.fullVisualization?.[j]).toMatchObject(h)
        )
      }
    )
  })

  test('a grant to another address is shown as a danger', () => {
    const [entryPointGrant, strangerGrant, revoke] = privilegeHumanizer(
      accountOp,
      transactions.privileges,
      humanizerInfo as HumanizerMeta
    )

    expect(strangerGrant.fullVisualization?.[0]).toMatchObject({
      type: 'action',
      warning: true
    })
    expect(strangerGrant.warnings).toEqual([
      {
        content:
          'This transaction grants control of this account to 0x6969174FD72466430a46e18234D0b530c9FD5f49!',
        level: 'danger'
      }
    ])
    expect(entryPointGrant.warnings).toBeUndefined()
    expect(entryPointGrant.fullVisualization?.[0]).not.toMatchObject({ warning: true })
    expect(revoke.warnings).toBeUndefined()
    expect(revoke.fullVisualization?.[0]).not.toMatchObject({ warning: true })
  })

  test('the entry point marker granted to another address is shown as a danger', () => {
    const [markerToStranger] = privilegeHumanizer(
      accountOp,
      [
        {
          to: accountOp.accountAddr,
          value: 0n,
          data: '0x0d5828d40000000000000000000000006969174FD72466430a46e18234D0b530c9FD5f490000000000000000000000000000000000000000000000000000000000007171'
        }
      ],
      humanizerInfo as HumanizerMeta
    )

    expect(markerToStranger.warnings).toMatchObject([{ level: 'danger' }])
  })

  test('a grant is recognised whatever the data casing', () => {
    const [upperCaseGrant] = privilegeHumanizer(
      accountOp,
      [
        {
          ...transactions.privileges[1],
          data: `0x${transactions.privileges[1].data.slice(2).toUpperCase()}`
        }
      ],
      humanizerInfo as HumanizerMeta
    )

    expect(upperCaseGrant.fullVisualization?.[0]).toMatchObject({
      type: 'action',
      content: 'Update access status'
    })
    expect(upperCaseGrant.warnings).toMatchObject([{ level: 'danger' }])
  })

  test('a grant keeps the warnings the call already carries', () => {
    const earlierWarning = { content: 'An earlier warning', level: 'warning' as const }
    const [grant] = privilegeHumanizer(
      accountOp,
      [{ ...transactions.privileges[1], warnings: [earlierWarning] }],
      humanizerInfo as HumanizerMeta
    )

    expect(grant.warnings).toEqual([
      earlierWarning,
      {
        content:
          'This transaction grants control of this account to 0x6969174FD72466430a46e18234D0b530c9FD5f49!',
        level: 'danger'
      }
    ])
  })

  test('the recovery kit grant to an audited action is shown without a danger', () => {
    const abiCoder = AbiCoder.defaultAbiCoder()
    const manager = '0x1111111111111111111111111111111111111111'
    const action = '0x2222222222222222222222222222222222222222'
    const slot = getAddress(
      `0x${keccak256(abiCoder.encode(['string', 'address'], ['kit', action])).slice(-40)}`
    )
    const kitGrant: Call = {
      to: accountOp.accountAddr,
      value: 0n,
      data: new Interface(AmbireAccount.abi).encodeFunctionData('setAddrPrivilege', [
        slot,
        keccak256(abiCoder.encode(['address', 'string'], [action, '']))
      ])
    }
    const commitSetup: Call = {
      to: manager,
      value: 0n,
      data: `${id('commitSetup(bytes32,uint256,bytes,bytes)').slice(0, 10)}${'00'.repeat(32)}`
    }
    const calls = [commitSetup, kitGrant]
    const withKit = {
      ...accountOp,
      calls,
      meta: { recoveryKit: { manager, auditedActions: [action] } }
    }

    const [, allowedGrant] = privilegeHumanizer(withKit, calls, humanizerInfo as HumanizerMeta)
    expect(allowedGrant.warnings).toBeUndefined()

    const [, grantWithoutKit] = privilegeHumanizer(
      { ...accountOp, calls },
      calls,
      humanizerInfo as HumanizerMeta
    )
    expect(grantWithoutKit.warnings).toMatchObject([{ level: 'danger' }])

    const [grantWithoutCommit] = privilegeHumanizer(
      { ...withKit, calls: [kitGrant] },
      [kitGrant],
      humanizerInfo as HumanizerMeta
    )
    expect(grantWithoutCommit.warnings).toMatchObject([{ level: 'danger' }])
  })

  describe('the recovery kit grant', () => {
    const abiCoder = AbiCoder.defaultAbiCoder()
    const ambireAccount = new Interface(AmbireAccount.abi)
    const manager = '0x5ff137D4b0FDCD49DcA30c7CF57E578a026d2789'
    const auditedAction = '0x2222222222222222222222222222222222222222'
    const unlistedAction = '0x3333333333333333333333333333333333333333'
    const kitSlot = (action: string) =>
      getAddress(
        `0x${keccak256(abiCoder.encode(['string', 'address'], ['kit', action])).slice(-40)}`
      )
    const kitValue = (action: string) =>
      keccak256(abiCoder.encode(['address', 'string'], [action, '']))
    const grant = (slot: string, value: string, to = accountOp.accountAddr): Call => ({
      to,
      value: 0n,
      data: ambireAccount.encodeFunctionData('setAddrPrivilege', [slot, value])
    })
    const kitGrant = grant(kitSlot(auditedAction), kitValue(auditedAction))
    const commitSetup: Call = {
      to: manager,
      value: 0n,
      data: `${id('commitSetup(bytes32,uint256,bytes,bytes)').slice(0, 10)}${'00'.repeat(32)}`
    }
    const humanize = (calls: Call[], recoveryKit = { manager, auditedActions: [auditedAction] }) =>
      privilegeHumanizer(
        { ...accountOp, calls, meta: { recoveryKit } },
        calls,
        humanizerInfo as HumanizerMeta
      )

    test('is shown as the audited action it allows, with no warning', () => {
      const [, shown] = humanize([commitSetup, kitGrant])
      expect(shown.fullVisualization).toMatchObject([
        { type: 'action', content: "Allow the recovery kit's audited action" },
        { type: 'address', address: auditedAction }
      ])
      expect(shown.fullVisualization).not.toContainEqual(expect.objectContaining({ warning: true }))
    })

    test('keeps the warnings the call already carries', () => {
      const earlierWarning = { content: 'An earlier warning', level: 'warning' as const }
      const calls = [commitSetup, { ...kitGrant, warnings: [earlierWarning] }]
      const [, shown] = privilegeHumanizer(
        {
          ...accountOp,
          calls,
          meta: { recoveryKit: { manager, auditedActions: [auditedAction] } }
        },
        calls,
        humanizerInfo as HumanizerMeta
      )
      expect(shown.warnings).toEqual([earlierWarning])
    })

    test('is shown without a danger whether it comes before or after the commitSetup', () => {
      const [grantFirst] = humanize([kitGrant, commitSetup])
      expect(grantFirst.warnings).toBeUndefined()
      const [, grantSecond] = humanize([commitSetup, kitGrant])
      expect(grantSecond.warnings).toBeUndefined()
    })

    test('matches the manager whatever its casing', () => {
      const [, lowerCaseCommit] = humanize([
        { ...commitSetup, to: manager.toLowerCase() },
        kitGrant
      ])
      expect(lowerCaseCommit.warnings).toBeUndefined()
      const [, lowerCaseManager] = humanize([commitSetup, kitGrant], {
        manager: manager.toLowerCase(),
        auditedActions: [auditedAction]
      })
      expect(lowerCaseManager.warnings).toBeUndefined()
    })

    test('with commitSetup sent to another address than the manager is shown as a danger', () => {
      const [, misdirected] = humanize([
        { ...commitSetup, to: '0x1111111111111111111111111111111111111111' },
        kitGrant
      ])
      expect(misdirected.warnings).toMatchObject([{ level: 'danger' }])
    })

    test('to an action that is not audited is shown as a danger', () => {
      const unlistedGrant = grant(kitSlot(unlistedAction), kitValue(unlistedAction))
      const [, shown] = humanize([commitSetup, unlistedGrant])
      expect(shown.warnings).toMatchObject([{ level: 'danger' }])
    })

    test('with the slot of an audited action and another value is shown as a danger', () => {
      const wrongValues = [
        kitValue(unlistedAction),
        abiCoder.encode(['uint256'], [1]),
        ENTRY_POINT_MARKER
      ]
      wrongValues.forEach((value) => {
        const [, shown] = humanize([commitSetup, grant(kitSlot(auditedAction), value)])
        expect(shown.warnings).toMatchObject([{ level: 'danger' }])
      })
    })

    test('sent to another account is shown as a danger naming that account', () => {
      const otherAccount = '0x77777777789A8BBEE6C64381e5E89E501fb0e4c8'
      const [, shown] = humanize([
        commitSetup,
        grant(kitSlot(auditedAction), kitValue(auditedAction), otherAccount)
      ])
      expect(shown.warnings).toMatchObject([
        { level: 'danger', content: expect.stringContaining(otherAccount) }
      ])
    })

    test('is not recognised in another function on the account', () => {
      const executeBySelf: Call = {
        to: accountOp.accountAddr,
        value: 0n,
        data: ambireAccount.encodeFunctionData('executeBySelf', [
          [[accountOp.accountAddr, 0n, kitGrant.data]]
        ])
      }
      const calls = [commitSetup, executeBySelf]
      expect(
        isRecoveryKitGrant(
          {
            ...accountOp,
            calls,
            meta: { recoveryKit: { manager, auditedActions: [auditedAction] } }
          },
          executeBySelf
        )
      ).toBe(false)
    })

    test('is not recognised when the op carries no recovery kit', () => {
      const calls = [commitSetup, kitGrant]
      expect(isRecoveryKitGrant({ ...accountOp, calls }, kitGrant)).toBe(false)
      expect(isRecoveryKitGrant({ ...accountOp, calls, meta: {} }, kitGrant)).toBe(false)
      expect(
        isRecoveryKitGrant(
          { ...accountOp, calls, meta: { recoveryKit: { manager, auditedActions: [] } } },
          kitGrant
        )
      ).toBe(false)
    })
  })

  test('a grant on another account names that account', () => {
    const otherAccount = '0x77777777789A8BBEE6C64381e5E89E501fb0e4c8'
    const [ownGrant, otherGrant] = privilegeHumanizer(
      accountOp,
      [
        transactions.privileges[1],
        { ...transactions.privileges[1], to: otherAccount.toLowerCase() }
      ],
      humanizerInfo as HumanizerMeta
    )

    expect(ownGrant.warnings?.[0]?.content).toBe(
      'This transaction grants control of this account to 0x6969174FD72466430a46e18234D0b530c9FD5f49!'
    )
    expect(otherGrant.warnings).toEqual([
      {
        content: `This transaction grants control of the account ${otherAccount} to 0x6969174FD72466430a46e18234D0b530c9FD5f49!`,
        level: 'danger'
      }
    ])
  })
})
