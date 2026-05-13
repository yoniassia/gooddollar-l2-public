// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title L2OutputOracle
 * @notice Stores L2 output roots posted by the proposer.
 *         Used by the OptimismPortal to verify withdrawal proofs.
 *         GoodDollar adaptation: emits UBI-relevant metadata per output.
 */
contract L2OutputOracle {
    /// @notice Output proposal structure
    struct OutputProposal {
        bytes32 outputRoot;
        uint128 timestamp;
        uint128 l2BlockNumber;
    }

    /// @notice Proposer address (only this address can submit outputs)
    address public proposer;

    /// @notice Challenger address (can delete invalid outputs)
    address public challenger;

    /// @notice Submission interval in L2 blocks
    uint256 public submissionInterval;

    /// @notice L2 block time in seconds
    uint256 public l2BlockTime;

    /// @notice Starting block number
    uint256 public startingBlockNumber;

    /// @notice Starting timestamp
    uint256 public startingTimestamp;

    /// @notice Array of output proposals
    OutputProposal[] public l2Outputs;

    event OutputProposed(
        bytes32 indexed outputRoot,
        uint256 indexed l2OutputIndex,
        uint256 indexed l2BlockNumber,
        uint256 l1Timestamp
    );

    event OutputDeleted(
        bytes32 indexed outputRoot,
        uint256 indexed l2OutputIndex
    );

    constructor() {
        proposer = msg.sender;
        challenger = msg.sender;
        submissionInterval = 120; // every 120 L2 blocks (~4 min at 2s blocks)
        l2BlockTime = 2;
        startingBlockNumber = 0;
        startingTimestamp = block.timestamp;
    }

    /// @notice Submit a new L2 output root
    function proposeL2Output(
        bytes32 _outputRoot,
        uint256 _l2BlockNumber,
        bytes32 /*_l1BlockHash*/,
        uint256 /*_l1BlockNumber*/
    ) external {
        require(msg.sender == proposer, "L2OutputOracle: only proposer");
        require(
            _l2BlockNumber >= nextBlockNumber(),
            "L2OutputOracle: block number too low"
        );

        uint256 index = l2Outputs.length;
        l2Outputs.push(OutputProposal({
            outputRoot: _outputRoot,
            timestamp: uint128(block.timestamp),
            l2BlockNumber: uint128(_l2BlockNumber)
        }));

        emit OutputProposed(_outputRoot, index, _l2BlockNumber, block.timestamp);
    }

    /// @notice Update proposer address (current proposer only)
    function setProposer(address _proposer) external {
        require(msg.sender == proposer, "L2OutputOracle: only proposer");
        proposer = _proposer;
    }

    /// @notice Delete an invalid output (challenger only)
    function deleteL2Outputs(uint256 _l2OutputIndex) external {
        require(msg.sender == challenger, "L2OutputOracle: only challenger");
        require(_l2OutputIndex < l2Outputs.length, "L2OutputOracle: invalid index");

        bytes32 root = l2Outputs[_l2OutputIndex].outputRoot;

        // Delete from index onwards
        for (uint256 i = _l2OutputIndex; i < l2Outputs.length; i++) {
            delete l2Outputs[i];
        }
        // Resize array
        assembly {
            sstore(l2Outputs.slot, _l2OutputIndex)
        }

        emit OutputDeleted(root, _l2OutputIndex);
    }

    /// @notice Get the next expected L2 block number
    function nextBlockNumber() public view returns (uint256) {
        if (l2Outputs.length == 0) return startingBlockNumber;
        return uint256(l2Outputs[l2Outputs.length - 1].l2BlockNumber) + submissionInterval;
    }

    /// @notice Get the latest output proposal
    function latestOutputIndex() external view returns (uint256) {
        require(l2Outputs.length > 0, "L2OutputOracle: no outputs");
        return l2Outputs.length - 1;
    }

    /// @notice Get output proposal at index
    function getL2Output(uint256 _l2OutputIndex) external view returns (OutputProposal memory) {
        require(_l2OutputIndex < l2Outputs.length, "L2OutputOracle: invalid index");
        return l2Outputs[_l2OutputIndex];
    }

    /// @notice Total number of outputs
    function latestBlockNumber() external view returns (uint256) {
        if (l2Outputs.length == 0) return startingBlockNumber;
        return uint256(l2Outputs[l2Outputs.length - 1].l2BlockNumber);
    }
}
