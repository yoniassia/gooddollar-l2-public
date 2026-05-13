# Slither Security Report — GoodDollar L2
**Date:** 2026-04-05
**Tool:** Slither v0.11.5
**Contracts:** 110 analyzed
**Total findings:** 747

## Summary
| Severity | Count |
|----------|-------|
| High | 30 |
| Medium | 148 |
| Low | 344 |
| Informational | 193 |
| Optimization | 32 |

## High Severity (30)

- **unchecked-transfer**: 16 finding(s)
- **arbitrary-send-erc20**: 7 finding(s)
- **arbitrary-send-eth**: 4 finding(s)
- **weak-prng**: 2 finding(s)
- **reentrancy-eth**: 1 finding(s)

## Key High Findings

### [arbitrary-send-erc20]
LendingStrategy.deposit(uint256) (src/yield/strategies/LendingStrategy.sol#81-89) uses arbitrary from in transferFrom: ! IERC20(asset).transferFrom(vault,address(this),amount) (src/yield/strategies/LendingStrategy.sol#83) 

### [arbitrary-send-erc20]
GoodLendPool.flashLoan(address,uint256,address,bytes) (src/lending/GoodLendPool.sol#462-501) uses arbitrary from in transferFrom: ! IERC20(asset).transferFrom(receiver,reserve.gToken,amount + premium) (src/lending/GoodLendPool.sol#484) 

### [arbitrary-send-erc20]
GoodLendPool.liquidate(address,address,address,uint256) (src/lending/GoodLendPool.sol#386-429) uses arbitrary from in transferFrom: ! IERC20(collateralAsset).transferFrom(collateralReserve.gToken,msg.sender,collateralToSeize) (src/lending/GoodLendPool.sol#423) 

### [arbitrary-send-erc20]
GoodLendPool.flashLoan(address,uint256,address,bytes) (src/lending/GoodLendPool.sol#462-501) uses arbitrary from in transferFrom: ! IERC20(asset).transferFrom(reserve.gToken,receiver,amount) (src/lending/GoodLendPool.sol#475) 

### [arbitrary-send-erc20]
StablecoinStrategy.deposit(uint256) (src/yield/strategies/StablecoinStrategy.sol#77-85) uses arbitrary from in transferFrom: ! IERC20(asset).transferFrom(vault,address(this),amount) (src/yield/strategies/StablecoinStrategy.sol#79) 

### [arbitrary-send-erc20]
GoodLendPool._withdraw(address,uint256,address) (src/lending/GoodLendPool.sol#277-305) uses arbitrary from in transferFrom: ! IERC20(asset).transferFrom(reserve.gToken,to,amount) (src/lending/GoodLendPool.sol#294) 

### [arbitrary-send-erc20]
GoodLendPool.borrow(address,uint256) (src/lending/GoodLendPool.sol#314-341) uses arbitrary from in transferFrom: ! IERC20(asset).transferFrom(reserve.gToken,msg.sender,amount) (src/lending/GoodLendPool.sol#331) 

### [arbitrary-send-eth]
L1StandardBridge.finalizeETHWithdrawal(address,address,uint256,bytes) (src/bridge/L1StandardBridge.sol#96-107) sends eth to arbitrary user 	Dangerous calls: 	- (ok,None) = _to.call{value: _amount}() (src/bridge/L1StandardBridge.sol#103) 

### [arbitrary-send-eth]
GoodTimelock.execute(address,uint256,bytes,bytes32) (src/governance/GoodTimelock.sol#198-228) sends eth to arbitrary user 	Dangerous calls: 	- (success,None) = target.call{value: value}(data) (src/governance/GoodTimelock.sol#224) 

### [arbitrary-send-eth]
OptimismPortal.finalizeWithdrawalTransaction(bytes32,address,uint256) (src/bridge/OptimismPortal.sol#93-116) sends eth to arbitrary user 	Dangerous calls: 	- (feeOk,None) = ubiTreasury.call{value: fee}() (src/bridge/OptimismPortal.sol#108) 	- (ok,None) = _to.call{value: payout}() (src/bridge/Optimis

### [arbitrary-send-eth]
GoodTimelock.executeBatch(address[],uint256[],bytes[],bytes32) (src/governance/GoodTimelock.sol#166-195) sends eth to arbitrary user 	Dangerous calls: 	- (success,None) = targets[i].call{value: values[i]}(calldatas[i]) (src/governance/GoodTimelock.sol#190) 

### [weak-prng]
VaultManager._rpow(uint256,uint256,uint256) (src/stable/VaultManager.sol#553-573) uses a weak PRNG: "n % 2 != 0 (src/stable/VaultManager.sol#565)"  

### [weak-prng]
VaultManager._rpow(uint256,uint256,uint256) (src/stable/VaultManager.sol#553-573) uses a weak PRNG: "n % 2 != 0 (src/stable/VaultManager.sol#557)"  

### [reentrancy-eth]
Reentrancy in FastWithdrawalLP.claimFastETHWithdrawal(uint256,address,bytes32) (src/bridge/FastWithdrawalLP.sol#235-278): 	External calls: 	- (ok,None) = to.call{value: netAmount}() (src/bridge/FastWithdrawalLP.sol#258) 	- (ok,None) = ubiPool.call{value: ubiFee}() (src/bridge/FastWithdrawalLP.sol#26

### [unchecked-transfer]
VoteEscrowedGD.earlyUnlock() (src/governance/VoteEscrowedGD.sol#169-196) ignores return value by gd.transfer(msg.sender,received) (src/governance/VoteEscrowedGD.sol#191) 

