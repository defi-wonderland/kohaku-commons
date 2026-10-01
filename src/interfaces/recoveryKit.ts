/** The recovery kit whose audited actions an account op may grant a privilege on the account */
export interface RecoveryKit {
  manager: string
  auditedActions: string[]
}
