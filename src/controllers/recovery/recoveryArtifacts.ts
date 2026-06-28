/* eslint-disable */
// AUTO-GENERATED from packages/recovery-poc/out — DO NOT EDIT BY HAND.
// Regenerate via: (cd packages/recovery-poc && forge build && node script/extract-artifacts.mjs)
//
// Exposes, per recovery contract: { abi, bytecode } (creation code) plus the
// CREATE2 constants + helpers the RecoveryController uses to deploy them FROM the
// extension via the canonical SINGLETON factory at salt 0.
//
// Constructor ABI (load-bearing for #computeDeployment):
//   RECOVERY_CONTROLLER     ctor (address _target, address _method)
//   AMBIRE_EXECUTOR_ADAPTER ctor (address _ambireAccount)   // controller bound later via setController(address)
//   ALWAYS_VALID_METHOD     ctor ()                          // no args

import { AbiCoder, getCreate2Address, Interface, keccak256, toBeHex } from 'ethers'

export const RECOVERY_CONTROLLER = {
  abi: [{"type":"constructor","inputs":[{"name":"_target","type":"address","internalType":"contract IERC7579Account"},{"name":"_method","type":"address","internalType":"contract IRecoveryMethod"}],"stateMutability":"nonpayable"},{"type":"function","name":"ROTATE_OWNER_SELECTOR","inputs":[],"outputs":[{"name":"","type":"bytes4","internalType":"bytes4"}],"stateMutability":"view"},{"type":"function","name":"initiateRecovery","inputs":[{"name":"newOwner","type":"address","internalType":"address"},{"name":"proof","type":"bytes","internalType":"bytes"}],"outputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"method","inputs":[],"outputs":[{"name":"","type":"address","internalType":"contract IRecoveryMethod"}],"stateMutability":"view"},{"type":"function","name":"pendingRecoveryHash","inputs":[{"name":"newOwner","type":"address","internalType":"address"}],"outputs":[{"name":"","type":"bytes32","internalType":"bytes32"}],"stateMutability":"view"},{"type":"function","name":"recoveryNonce","inputs":[{"name":"","type":"address","internalType":"address"}],"outputs":[{"name":"","type":"uint256","internalType":"uint256"}],"stateMutability":"view"},{"type":"function","name":"target","inputs":[],"outputs":[{"name":"","type":"address","internalType":"contract IERC7579Account"}],"stateMutability":"view"},{"type":"event","name":"RecoveryExecuted","inputs":[{"name":"target","type":"address","indexed":true,"internalType":"address"},{"name":"newOwner","type":"address","indexed":true,"internalType":"address"},{"name":"recoveryHash","type":"bytes32","indexed":false,"internalType":"bytes32"},{"name":"usedNonce","type":"uint256","indexed":false,"internalType":"uint256"}],"anonymous":false},{"type":"error","name":"MethodRejected","inputs":[]},{"type":"error","name":"ZeroAddress","inputs":[]}] as const,
  bytecode: '0x60c0346100c657601f61077838819003918201601f19168301916001600160401b038311848410176100cb5780849260409485528339810103126100c65780516001600160a01b0391828216908183036100c65760200151928316908184036100c657159081156100bd575b506100ab5760805260a05260405161069690816100e28239608051818181609f0152818161013801526104de015260a0518181816101c401526105690152f35b60405163d92e233d60e01b8152600490fd5b9050153861006b565b600080fd5b634e487b7160e01b600052604160045260246000fdfe608060408181526004918236101561001657600080fd5b600092833560e01c9182632c383a9f146105555750816349bcad0a1461051e5781635f61748e146104bb578163761352ec146100ce57508063d4b839921461008b5763fb2516e41461006757600080fd5b3461008757816003193601126100875751633c037ee360e01b8152602090f35b5080fd5b5034610087578160031936011261008757517f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03168152602090f35b9050346104b757816003193601126104b7576100e8610598565b9160249283359067ffffffffffffffff948583116104b357366023840112156104b357828501358681116104af57368282860101116104af576001600160a01b0383811697909290881561049f577f00000000000000000000000000000000000000000000000000000000000000009784891698898c52888c8b602098828a9384528989868320549d8e61017c918761060e565b9e8f97519788966301a86b5560e41b88528b880152828701526044860160609052826064870152016084850137898301608401528180601f19601f819c0116810103608401917f0000000000000000000000000000000000000000000000000000000000000000165afa908115610495578d9161045f575b5015610450576001870180881161043e578a8d528c8752898d2055885186810190633c037ee360e01b82528c8682015285815260608101918183108684111761042c57828f93928e928a989796948f5260808201946bffffffffffffffffffffffff199060601b1685528560948301528151908160b48401610275926105eb565b81010360348101825260540161028b90826105b3565b838d80519a8b95869485936335a4725960e21b8552858b8601528d850152519081604485015281606485016102bf926105eb565b601f0116810103606401925af180156104225761030b575b8b8b8b7f6bd85ef680118504efd8ed1e7e3b5d6b1672ff538e9da7c4ba706726f2c8699a8c8c8c8c8351928352820152a380f35b3d808d873e61031a81876105b3565b850194868187031261041a5780519083821161041e57019480601f8701121561041a578551948386116104095787808760051b978d519061035d838b01836105b3565b815201968801019682881161040557888101965b88881061038157505050506102d7565b875186811161040057820184603f82011215610400578a810151918783116103eb578b8f806103ba899251938d601f89011601846105b3565b85835285850101116103e4578f8d9485946103d99286850191016105eb565b815201970196610371565b5050508f80fd5b505050508d604184634e487b7160e01b835252fd5b508f80fd5b8e80fd5b634e487b7160e01b8e52604183528dfd5b8c80fd5b8d80fd5b89513d8e823e3d90fd5b634e487b7160e01b8f5260418552868ffd5b634e487b7160e01b8d5260118352848dfd5b5087516360f54d9760e01b8152fd5b90508681813d831161048e575b61047681836105b3565b8101031261041a5751801515810361041a57386101f4565b503d61046c565b8a513d8f823e3d90fd5b865163d92e233d60e01b81528890fd5b8780fd5b8680fd5b8280fd5b505034610087576020366003190112610087576105176020926104dc610598565b7f00000000000000000000000000000000000000000000000000000000000000006001600160a01b031680835282865291849020549161060e565b9051908152f35b5050346100875760203660031901126100875760209181906001600160a01b03610546610598565b16815280845220549051908152f35b8490346100875781600319360112610087577f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03168152602090f35b600435906001600160a01b03821682036105ae57565b600080fd5b90601f8019910116810190811067ffffffffffffffff8211176105d557604052565b634e487b7160e01b600052604160045260246000fd5b60005b8381106105fe5750506000910152565b81810151838201526020016105ee565b909160405191602083019330855246604085015260018060a01b03809216606085015216608083015260a082015260a0815260c0810181811067ffffffffffffffff8211176105d5576040525190209056fea2646970667358221220908d3b3b3fff1ae4b12b341e68b06dab2252ffe6edd8c6e58e8488c6075b7d4564736f6c63430008130033' as `0x${string}`
} as const

export const AMBIRE_EXECUTOR_ADAPTER = {
  abi: [{"type":"constructor","inputs":[{"name":"_ambireAccount","type":"address","internalType":"address"}],"stateMutability":"nonpayable"},{"type":"function","name":"ambireAccount","inputs":[],"outputs":[{"name":"","type":"address","internalType":"address"}],"stateMutability":"view"},{"type":"function","name":"controller","inputs":[],"outputs":[{"name":"","type":"address","internalType":"address"}],"stateMutability":"view"},{"type":"function","name":"executeFromExecutor","inputs":[{"name":"mode","type":"bytes32","internalType":"bytes32"},{"name":"executionCalldata","type":"bytes","internalType":"bytes"}],"outputs":[{"name":"returnData","type":"bytes[]","internalType":"bytes[]"}],"stateMutability":"payable"},{"type":"function","name":"installModule","inputs":[{"name":"moduleTypeId","type":"uint256","internalType":"uint256"},{"name":"module","type":"address","internalType":"address"},{"name":"","type":"bytes","internalType":"bytes"}],"outputs":[],"stateMutability":"nonpayable"},{"type":"function","name":"isModuleInstalled","inputs":[{"name":"moduleTypeId","type":"uint256","internalType":"uint256"},{"name":"module","type":"address","internalType":"address"},{"name":"","type":"bytes","internalType":"bytes"}],"outputs":[{"name":"installed","type":"bool","internalType":"bool"}],"stateMutability":"view"},{"type":"function","name":"setController","inputs":[{"name":"_controller","type":"address","internalType":"address"}],"outputs":[],"stateMutability":"nonpayable"},{"type":"event","name":"ModuleInstalled","inputs":[{"name":"moduleTypeId","type":"uint256","indexed":true,"internalType":"uint256"},{"name":"module","type":"address","indexed":true,"internalType":"address"}],"anonymous":false},{"type":"error","name":"ControllerAlreadySet","inputs":[]},{"type":"error","name":"NotController","inputs":[]},{"type":"error","name":"UnsupportedIntent","inputs":[]},{"type":"error","name":"UnsupportedMode","inputs":[]},{"type":"error","name":"ZeroAddress","inputs":[]}] as const,
  bytecode: '0x60a03461008857601f61077b38819003918201601f19168301916001600160401b0383118484101761008d5780849260209460405283398101031261008857516001600160a01b0381168082036100885715610076576080526040516106d790816100a4823960805181818160a501526101f10152f35b60405163d92e233d60e01b8152600490fd5b600080fd5b634e487b7160e01b600052604160045260246000fdfe608060408181526004918236101561001657600080fd5b600092833560e01c918263112d3a7d146105575750816392eefe9b146104f05781639517e29f14610472578163d691c964146100d457508063e85cbc5e146100915763f77c47911461006757600080fd5b3461008d578160031936011261008d57905490516001600160a01b039091168152602090f35b5080fd5b503461008d578160031936011261008d57517f00000000000000000000000000000000000000000000000000000000000000006001600160a01b03168152602090f35b82848160031936011261046f5760249182359367ffffffffffffffff9485811161046b576101059036908301610592565b84546001600160a01b03949291908516330361045c57833561044d576034811061040b57806014116104075780603411610407576033190186811080156103e1575b6103d25786116103ce576038013583169586156103c057815192828401848110838211176103ae578352600197888552865b6020808210156101ab578551602092916101928261064c565b8a82528a81830152606088830152828901015201610179565b5050869388878b978351906020956303560a3560e21b878401528483015289604483015260448252608082018281108982111761039c578086526101ee8161064c565b837f000000000000000000000000000000000000000000000000000000000000000016928382528a60a082015260c08101526102298261067e565b526102338161067e565b50813b156103985791889185519384926355e29a2f60e11b8452868401898b86015282518091528d604486018b60448460051b89010195019388925b8d85851061034857505050505050508383809203925af1801561033e57610319575b5081519383850195858710908711176103065785835286855282518481528551818601819052600581901b8201850191908a908990888c858a015b8382106102d95786880387f35b909192939483806102f5839a603f198b8203018652895161060c565b9997019594939190910191016102cc565b604190634e487b7160e01b600052526000fd5b85819792971161032c5782529487610291565b634e487b7160e01b8252604185528682fd5b83513d89823e3d90fd5b929598509295829194979950610384906043198c82030187528d808b51888151168452858101518685015201519160608092820152019061060c565b9701930193018795938f928f98969361026f565b8880fd5b634e487b7160e01b8a5260418852848afd5b634e487b7160e01b8752604182528787fd5b505163d92e233d60e01b8152fd5b8480fd5b505051631ed9081960e31b8152fd5b508084116104075760348201356001600160e01b031916633c037ee360e01b1415610147565b8580fd5b825162461bcd60e51b81526020818601819052818901527f455243373537394d6f64653a206261642073696e676c652063616c6c646174616044820152606490fd5b50505163ad6e405560e01b8152fd5b5050516323019e6760e01b8152fd5b8380fd5b80fd5b919050346104ec57610483366105c5565b50506001600160a01b03169290919083156104de575081845260016020528084208385526020528320600160ff198254161790557fd21d0b289f126c4b473ea641963e766833c2f13866e4ff480abd787c100ef1238380a380f35b905163d92e233d60e01b8152fd5b8280fd5b919050346104ec5760203660031901126104ec576001600160a01b038235818116939192908490036103ce57831561054a57845492831661053d5750506001600160a01b03191617815580f35b5163ca231c2360e01b8152fd5b5163d92e233d60e01b8152fd5b849084346104ec5760ff9060209361056e366105c5565b5050908252600186528282206001600160a01b039091168252855220541615158152f35b9181601f840112156105c05782359167ffffffffffffffff83116105c057602083818601950101116105c057565b600080fd5b60606003198201126105c057600435916024356001600160a01b03811681036105c057916044359067ffffffffffffffff82116105c05761060891600401610592565b9091565b919082519283825260005b848110610638575050826000602080949584010152601f8019910116010190565b602081830181015184830182015201610617565b6060810190811067ffffffffffffffff82111761066857604052565b634e487b7160e01b600052604160045260246000fd5b80511561068b5760200190565b634e487b7160e01b600052603260045260246000fdfea2646970667358221220b7a49c0211e62d179ab4fba249ff5718a9e318572a0cec75ec77743859789caa64736f6c63430008130033' as `0x${string}`
} as const

export const ALWAYS_VALID_METHOD = {
  abi: [{"type":"function","name":"verify","inputs":[{"name":"","type":"address","internalType":"address"},{"name":"","type":"bytes32","internalType":"bytes32"},{"name":"","type":"bytes","internalType":"bytes"}],"outputs":[{"name":"ok","type":"bool","internalType":"bool"}],"stateMutability":"pure"}] as const,
  bytecode: '0x608080604052346100155760c0908161001b8239f35b600080fdfe6080806040526004361015601257600080fd5b600090813560e01c631a86b55014602857600080fd5b3460825760603660031901126082576004356001600160a01b0381160360825760443567ffffffffffffffff8082116086573660238301121560865781600401359081116086573691016024011160825780600160209252f35b5080fd5b8380fdfea2646970667358221220bcdd344c4811ce1f685c40518ef8dbad0ef186a68107d47af0cc40304a10efb564736f6c63430008130033' as `0x${string}`
} as const

/**
 * Canonical CREATE2 factory used by the wallet's native deploy path
 * (`toSingletonCall()`): any `{ to: null }` call is routed to
 * `SINGLETON.deploy(initCode, salt)`. VERIFIED live on Sepolia.
 */
export const SINGLETON = '0xce0042B868300000d44A59004Da54A005ffdcf9f'

/**
 * The salt the wallet's deploy path hardcodes for every SINGLETON deployment:
 * `toBeHex(0, 32)` (a 32-byte zero word). Address prediction MUST use this exact
 * salt or the predicted address will not match the deployed one.
 */
export const DEPLOY_SALT = toBeHex(0, 32)

/**
 * The single ERC-7579 ModeCode recovery v0 emits/accepts: callType=single,
 * execType=default, no selector, no payload — i.e. the zero word. Matches
 * `ERC7579Mode.MODE_SINGLE_DEFAULT` on-chain.
 */
export const MODE_SINGLE_DEFAULT = toBeHex(0, 32)

/**
 * Append ABI-encoded constructor args to a contract's creation bytecode to form
 * the full CREATE2 init code. With no args this returns the bytecode unchanged.
 *
 * @param bytecode  0x-prefixed creation bytecode (from the consts above).
 * @param types     Solidity ABI types of the constructor args, in order.
 * @param args      Constructor arg values, in order.
 * @returns         0x-prefixed init code: `bytecode || abiEncode(types, args)`.
 */
export function buildInitCode(
  bytecode: `0x${string}`,
  types: string[] = [],
  args: any[] = []
): `0x${string}` {
  if (types.length === 0) return bytecode
  const encoded = AbiCoder.defaultAbiCoder().encode(types, args)
  return (bytecode + encoded.slice(2)) as `0x${string}`
}

/**
 * Predict the address a SINGLETON CREATE2 deployment of `initCode` will land at.
 * Mirrors the wallet's own prediction idiom (see
 * `libs/proxyDeploy/getAmbireAddressTwo.ts`): `getCreate2Address(factory, salt,
 * keccak256(initCode))`.
 *
 * @param initCode  Full init code (creation bytecode + encoded ctor args).
 * @param salt      32-byte CREATE2 salt. Defaults to {@link DEPLOY_SALT} (the
 *                  wallet's hardcoded salt 0).
 * @returns         The checksummed contract address.
 */
export function predictCreate2(initCode: `0x${string}`, salt: string = DEPLOY_SALT): string {
  return getCreate2Address(SINGLETON, salt, keccak256(initCode))
}

const SINGLETON_IFACE = new Interface([
  'function deploy(bytes _initCode, bytes32 _salt) returns (address payable)'
])

/**
 * Build an EXPLICIT call to the SINGLETON's CREATE2 `deploy(initCode, salt)`.
 *
 * Use this instead of a `{ to: null }` call: `to: null` is only rewritten to the
 * singleton by `toSingletonCall` on the deployed-smart-account execution path. On a
 * 7702-delegated EOA (or any path that doesn't run that rewrite) a `to: null` call
 * becomes a plain EOA `CREATE`, deploying to a NONCE-derived address instead of the
 * deterministic CREATE2 address our wiring predicts. Calling the singleton explicitly
 * makes the deploy CREATE2 on EVERY account type, so the contract lands exactly at
 * `predictCreate2(initCode)`.
 *
 * @param initCode  Full init code (creation bytecode + encoded ctor args).
 * @param salt      CREATE2 salt. Defaults to {@link DEPLOY_SALT}.
 * @returns         `{ to: SINGLETON, data }` ready to drop into an account-op call.
 */
export function buildSingletonDeployCall(
  initCode: `0x${string}`,
  salt: string = DEPLOY_SALT
): { to: string; data: string } {
  return {
    to: SINGLETON,
    data: SINGLETON_IFACE.encodeFunctionData('deploy', [initCode, salt])
  }
}
