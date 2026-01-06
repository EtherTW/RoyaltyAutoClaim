// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Helper contract that rejects ETH transfers
contract RejectEther {
    // No receive() or fallback() function, so it rejects ETH
    // Or explicitly revert:
    receive() external payable {
        revert("Reject ETH");
    }
}
