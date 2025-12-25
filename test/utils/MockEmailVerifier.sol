// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IEmailVerifier} from "../../src/EmailVerifier.sol";
import {TitleHashVerifierLib} from "../../src/TitleHashVerifierLib.sol";

/// @title MockEmailVerifier
/// @notice Mock implementation of IEmailVerifier interface for testing
contract MockEmailVerifier is IEmailVerifier {
    bool public mockVerifyResult = true;

    /// @dev Sets the mock verification result for testing
    /// @param result The verification result to return
    function setMockVerifyResult(bool result) external {
        mockVerifyResult = result;
    }

    /// @dev Mocked email verification that returns the configured result
    function verifyEmail(string calldata, TitleHashVerifierLib.EmailProof calldata) external view returns (bool) {
        return mockVerifyResult;
    }
}
