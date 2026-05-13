// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title GoodStableToken (gUSD)
 * @notice USD-pegged stablecoin for the GoodDollar L2 ecosystem.
 *         All protocol revenue from minting/liquidations flows to UBI.
 * @dev    Only authorized minters (CDPManager, PSM) can mint.
 *         Anyone can burn their own tokens.
 *         EIP-2612 permit for gasless approvals.
 */
contract GoodStableToken is ERC20, ERC20Permit, ERC20Burnable, AccessControl, Pausable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice Emitted when tokens are minted via CDP
    event Mint(address indexed to, uint256 amount);

    constructor(address admin) ERC20("GoodStable Dollar", "gUSD") ERC20Permit("GoodStable Dollar") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    /**
     * @notice Mint gUSD. Only callable by authorized minters (CDPManager, PSM).
     * @param to     Recipient address
     * @param amount Amount to mint (18 decimals)
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) whenNotPaused {
        _mint(to, amount);
        emit Mint(to, amount);
    }

    /// @notice Emergency pause — stops all minting and transfers
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Unpause
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override whenNotPaused {
        super._beforeTokenTransfer(from, to, amount);
    }
}
