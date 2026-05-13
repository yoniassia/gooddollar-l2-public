// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/interfaces/IERC20.sol";

/**
 * @title GoodLendToken (gToken)
 * @notice Interest-bearing receipt token for GoodLend deposits, inspired by Aave's aToken.
 *         Balance grows automatically as interest accrues — no staking or claiming needed.
 *
 *         Internal accounting uses "scaled" balances:
 *           scaledBalance = deposit / liquidityIndex_at_deposit
 *           currentBalance = scaledBalance * currentLiquidityIndex
 *
 * @dev    Only the GoodLend Pool contract may mint/burn.
 */
contract GoodLendToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint256 internal constant RAY = 1e27;

    /// @notice The GoodLend Pool (only caller allowed to mint/burn)
    address public immutable pool;

    /// @notice The underlying asset this gToken represents
    address public immutable underlyingAsset;

    /// @notice Scaled balances (divide by liquidityIndex to get deposit-time amount)
    mapping(address => uint256) internal _scaledBalances;
    uint256 internal _totalScaledSupply;

    // Events
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Mint(address indexed to, uint256 amount, uint256 scaledAmount, uint256 index);
    event Burn(address indexed from, uint256 amount, uint256 scaledAmount, uint256 index);

    // Allowances (standard ERC20)
    mapping(address => mapping(address => uint256)) public allowance;

    modifier onlyPool() {
        require(msg.sender == pool, "GoodLendToken: caller not pool");
        _;
    }

    constructor(address _pool, address _underlying, string memory _name, string memory _symbol) {
        pool = _pool;
        underlyingAsset = _underlying;
        name = _name;
        symbol = _symbol;
        // Allow the pool to pull underlying out of this gToken for borrows and withdrawals.
        IERC20(_underlying).approve(_pool, type(uint256).max);
    }

    // ============ Read Functions ============

    /**
     * @notice Returns the current balance including accrued interest.
     * @dev Reads the current liquidity index from the Pool.
     */
    function balanceOf(address account) external view returns (uint256) {
        uint256 index = _currentIndex();
        return (_scaledBalances[account] * index) / RAY;
    }

    function totalSupply() external view returns (uint256) {
        uint256 index = _currentIndex();
        return (_totalScaledSupply * index) / RAY;
    }

    function scaledBalanceOf(address account) external view returns (uint256) {
        return _scaledBalances[account];
    }

    function scaledTotalSupply() external view returns (uint256) {
        return _totalScaledSupply;
    }

    // ============ Pool-Only Mutators ============

    /**
     * @notice Mint gTokens to a user upon deposit.
     * @param to     Recipient.
     * @param amount Amount of underlying deposited.
     * @param index  Current liquidity index (RAY).
     */
    function mint(address to, uint256 amount, uint256 index) external onlyPool {
        uint256 scaledAmount = (amount * RAY) / index;
        require(scaledAmount > 0, "GoodLendToken: zero scaled mint");

        _scaledBalances[to] += scaledAmount;
        _totalScaledSupply += scaledAmount;

        emit Mint(to, amount, scaledAmount, index);
        emit Transfer(address(0), to, amount);
    }

    /**
     * @notice Burn gTokens from a user upon withdrawal.
     * @param from   The holder.
     * @param amount Amount of underlying withdrawn.
     * @param index  Current liquidity index (RAY).
     */
    function burn(address from, uint256 amount, uint256 index) external onlyPool {
        uint256 scaledAmount = (amount * RAY + index - 1) / index; // round up
        require(_scaledBalances[from] >= scaledAmount, "GoodLendToken: burn exceeds balance");

        _scaledBalances[from] -= scaledAmount;
        _totalScaledSupply -= scaledAmount;

        emit Burn(from, amount, scaledAmount, index);
        emit Transfer(from, address(0), amount);
    }

    /**
     * @notice Mint gTokens to the treasury (protocol revenue).
     * @param treasury Treasury address.
     * @param amount   Amount (in underlying) to mint to treasury.
     * @param index    Current liquidity index.
     */
    function mintToTreasury(address treasury, uint256 amount, uint256 index) external onlyPool {
        if (amount == 0) return;
        uint256 scaledAmount = (amount * RAY) / index;
        _scaledBalances[treasury] += scaledAmount;
        _totalScaledSupply += scaledAmount;
        emit Mint(treasury, amount, scaledAmount, index);
        emit Transfer(address(0), treasury, amount);
    }

    // ============ ERC20 Transfers (of gTokens) ============

    function transfer(address to, uint256 amount) external returns (bool) {
        _transferScaled(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            require(a >= amount, "GoodLendToken: allowance");
            allowance[from][msg.sender] = a - amount;
        }
        _transferScaled(from, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    // ============ Internal ============

    function _transferScaled(address from, address to, uint256 amount) internal {
        uint256 index = _currentIndex();
        uint256 scaledAmount = (amount * RAY) / index;
        require(_scaledBalances[from] >= scaledAmount, "GoodLendToken: insufficient");
        _scaledBalances[from] -= scaledAmount;
        _scaledBalances[to] += scaledAmount;
        emit Transfer(from, to, amount);
    }

    function _currentIndex() internal view returns (uint256) {
        // Read from pool — pool exposes getLiquidityIndex(asset)
        (bool ok, bytes memory data) = pool.staticcall(
            abi.encodeWithSignature("getLiquidityIndex(address)", underlyingAsset)
        );
        if (ok && data.length == 32) {
            return abi.decode(data, (uint256));
        }
        return RAY; // fallback: no interest accrued
    }
}
