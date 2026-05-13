// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ConditionalTokens
 * @notice ERC-1155 outcome tokens for GoodPredict binary markets.
 *         Each market has two tokens: YES (tokenId = marketId * 2) and
 *         NO (tokenId = marketId * 2 + 1). Only the MarketFactory can
 *         mint/burn. Winnings can be redeemed after resolution.
 *
 * @dev Minimal ERC-1155 without full OpenZeppelin to reduce dependencies.
 *      Inherits no base contract intentionally for clarity.
 */
contract ConditionalTokens {
    // ============ ERC-1155 State ============

    /// @dev owner → tokenId → balance
    mapping(address => mapping(uint256 => uint256)) public balanceOf;

    /// @dev owner → operator → approved
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    // ============ Roles ============

    address public immutable factory;

    // ============ Events ============

    event TransferSingle(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256 id,
        uint256 value
    );
    event TransferBatch(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256[] ids,
        uint256[] values
    );
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    // ============ Errors ============

    error NotFactory();
    error InsufficientBalance();
    error NotApproved();
    error LengthMismatch();
    error ZeroAddress();

    // ============ Constructor ============

    constructor(address _factory) {
        if (_factory == address(0)) revert ZeroAddress();
        factory = _factory;
    }

    // ============ ERC-1155 ============

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes calldata /* data */
    ) external {
        if (to == address(0)) revert ZeroAddress();
        if (from != msg.sender && !isApprovedForAll[from][msg.sender]) revert NotApproved();
        if (balanceOf[from][id] < amount) revert InsufficientBalance();
        balanceOf[from][id] -= amount;
        balanceOf[to][id] += amount;
        emit TransferSingle(msg.sender, from, to, id, amount);
    }

    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes calldata /* data */
    ) external {
        if (to == address(0)) revert ZeroAddress();
        if (from != msg.sender && !isApprovedForAll[from][msg.sender]) revert NotApproved();
        if (ids.length != amounts.length) revert LengthMismatch();
        for (uint256 i = 0; i < ids.length; i++) {
            if (balanceOf[from][ids[i]] < amounts[i]) revert InsufficientBalance();
            balanceOf[from][ids[i]] -= amounts[i];
            balanceOf[to][ids[i]] += amounts[i];
        }
        emit TransferBatch(msg.sender, from, to, ids, amounts);
    }

    function balanceOfBatch(
        address[] calldata owners,
        uint256[] calldata ids
    ) external view returns (uint256[] memory balances) {
        if (owners.length != ids.length) revert LengthMismatch();
        balances = new uint256[](owners.length);
        for (uint256 i = 0; i < owners.length; i++) {
            balances[i] = balanceOf[owners[i]][ids[i]];
        }
    }

    // ============ Factory-Only ============

    function mint(address to, uint256 tokenId, uint256 amount) external {
        if (msg.sender != factory) revert NotFactory();
        balanceOf[to][tokenId] += amount;
        emit TransferSingle(msg.sender, address(0), to, tokenId, amount);
    }

    function burn(address from, uint256 tokenId, uint256 amount) external {
        if (msg.sender != factory) revert NotFactory();
        if (balanceOf[from][tokenId] < amount) revert InsufficientBalance();
        balanceOf[from][tokenId] -= amount;
        emit TransferSingle(msg.sender, from, address(0), tokenId, amount);
    }

    // ============ Helpers ============

    /// @notice YES token ID for a market
    function yesTokenId(uint256 marketId) external pure returns (uint256) {
        return marketId * 2;
    }

    /// @notice NO token ID for a market
    function noTokenId(uint256 marketId) external pure returns (uint256) {
        return marketId * 2 + 1;
    }
}
