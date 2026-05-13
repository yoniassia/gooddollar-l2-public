// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DebtToken (Variable Rate)
 * @notice Non-transferable token tracking variable-rate debt in GoodLend.
 *         Scaled by the variable borrow index — balance grows automatically.
 *
 *         realDebt = scaledBalance * currentBorrowIndex
 *
 * @dev    Only the GoodLend Pool contract may mint/burn.
 *         Transfer functions revert — debt is non-transferable.
 */
contract DebtToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint256 internal constant RAY = 1e27;

    address public immutable pool;
    address public immutable underlyingAsset;

    mapping(address => uint256) internal _scaledBalances;
    uint256 internal _totalScaledSupply;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Mint(address indexed to, uint256 amount, uint256 scaledAmount, uint256 index);
    event Burn(address indexed from, uint256 amount, uint256 scaledAmount, uint256 index);

    modifier onlyPool() {
        require(msg.sender == pool, "DebtToken: caller not pool");
        _;
    }

    constructor(address _pool, address _underlying, string memory _name, string memory _symbol) {
        pool = _pool;
        underlyingAsset = _underlying;
        name = _name;
        symbol = _symbol;
    }

    // ============ Read ============

    function balanceOf(address account) external view returns (uint256) {
        uint256 index = _currentBorrowIndex();
        return (_scaledBalances[account] * index) / RAY;
    }

    function totalSupply() external view returns (uint256) {
        uint256 index = _currentBorrowIndex();
        return (_totalScaledSupply * index) / RAY;
    }

    function scaledBalanceOf(address account) external view returns (uint256) {
        return _scaledBalances[account];
    }

    function scaledTotalSupply() external view returns (uint256) {
        return _totalScaledSupply;
    }

    // ============ Pool-only ============

    function mint(address to, uint256 amount, uint256 index) external onlyPool {
        uint256 scaled = (amount * RAY) / index;
        require(scaled > 0, "DebtToken: zero mint");
        _scaledBalances[to] += scaled;
        _totalScaledSupply += scaled;
        emit Mint(to, amount, scaled, index);
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount, uint256 index) external onlyPool {
        uint256 scaled = (amount * RAY + index - 1) / index; // round up
        if (scaled > _scaledBalances[from]) scaled = _scaledBalances[from];
        _scaledBalances[from] -= scaled;
        _totalScaledSupply -= scaled;
        emit Burn(from, amount, scaled, index);
        emit Transfer(from, address(0), amount);
    }

    // ============ Non-transferable ============

    function transfer(address, uint256) external pure returns (bool) {
        revert("DebtToken: non-transferable");
    }

    function transferFrom(address, address, uint256) external pure returns (bool) {
        revert("DebtToken: non-transferable");
    }

    function approve(address, uint256) external pure returns (bool) {
        revert("DebtToken: non-transferable");
    }

    function allowance(address, address) external pure returns (uint256) {
        return 0;
    }

    // ============ Internal ============

    function _currentBorrowIndex() internal view returns (uint256) {
        (bool ok, bytes memory data) = pool.staticcall(
            abi.encodeWithSignature("getBorrowIndex(address)", underlyingAsset)
        );
        if (ok && data.length == 32) {
            return abi.decode(data, (uint256));
        }
        return RAY;
    }
}
