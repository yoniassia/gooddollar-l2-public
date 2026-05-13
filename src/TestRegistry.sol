// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

/// @title TestRegistry
/// @notice On-chain registry for logging transaction test results on devnet.
///         Testers call `logResult` after each test transaction to record the
///         outcome permanently on-chain. The frontend can query the full history
///         via the `TestResultLogged` event or the `getResults`/`getResultCount`
///         view helpers.
contract TestRegistry {
    // ─────────────────────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────────────────────

    struct TestResult {
        address tester;           // EOA or contract that called logResult
        address contractTested;   // address of the contract under test
        bytes4  functionSelector; // 4-byte selector of the tested function
        bool    success;          // true = pass, false = fail
        uint256 gasUsed;          // gas consumed by the test transaction
        uint256 timestamp;        // block.timestamp at logging time
        string  note;             // optional human-readable note / revert reason
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────────────────────────────────

    TestResult[] private _results;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Emitted on every logged result. Indexed fields allow the frontend
    ///      to filter efficiently by tester, contract, or pass/fail status.
    event TestResultLogged(
        uint256 indexed resultId,
        address indexed tester,
        address indexed contractTested,
        bytes4          functionSelector,
        bool            success,
        uint256         gasUsed,
        uint256         timestamp,
        string          note
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Write
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Log the result of a single test transaction.
    /// @param contractTested    Address of the contract exercised in the test.
    /// @param functionSelector  4-byte selector of the function called.
    /// @param success           Whether the call succeeded.
    /// @param gasUsed           Gas used by the test transaction (caller-supplied).
    /// @param note              Optional note, e.g. revert reason on failure.
    /// @return resultId         Storage index of the newly appended result.
    function logResult(
        address contractTested,
        bytes4  functionSelector,
        bool    success,
        uint256 gasUsed,
        string calldata note
    ) external returns (uint256 resultId) {
        resultId = _results.length;

        _results.push(TestResult({
            tester:           msg.sender,
            contractTested:   contractTested,
            functionSelector: functionSelector,
            success:          success,
            gasUsed:          gasUsed,
            timestamp:        block.timestamp,
            note:             note
        }));

        emit TestResultLogged(
            resultId,
            msg.sender,
            contractTested,
            functionSelector,
            success,
            gasUsed,
            block.timestamp,
            note
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Read
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Total number of results logged so far.
    function getResultCount() external view returns (uint256) {
        return _results.length;
    }

    /// @notice Fetch a single result by its storage index.
    function getResult(uint256 resultId) external view returns (TestResult memory) {
        require(resultId < _results.length, "TestRegistry: out of range");
        return _results[resultId];
    }

    /// @notice Fetch a paginated slice of results (inclusive range).
    /// @param from  First index to return (0-based).
    /// @param to    Last index to return (inclusive). Capped to length-1.
    function getResults(uint256 from, uint256 to)
        external
        view
        returns (TestResult[] memory results)
    {
        uint256 len = _results.length;
        require(from <= to, "TestRegistry: invalid range");
        require(from < len, "TestRegistry: from out of range");

        if (to >= len) to = len - 1;
        uint256 count = to - from + 1;
        results = new TestResult[](count);
        for (uint256 i = 0; i < count; ++i) {
            results[i] = _results[from + i];
        }
    }

    /// @notice Return all results logged by a specific tester address.
    ///         Gas-unbounded — intended for off-chain / frontend reads only.
    function getResultsByTester(address tester)
        external
        view
        returns (TestResult[] memory matches, uint256[] memory ids)
    {
        uint256 len = _results.length;
        uint256 matchCount;

        // First pass: count matches.
        for (uint256 i = 0; i < len; ++i) {
            if (_results[i].tester == tester) ++matchCount;
        }

        // Second pass: populate.
        matches = new TestResult[](matchCount);
        ids     = new uint256[](matchCount);
        uint256 j;
        for (uint256 i = 0; i < len; ++i) {
            if (_results[i].tester == tester) {
                matches[j] = _results[i];
                ids[j]     = i;
                ++j;
            }
        }
    }
}
