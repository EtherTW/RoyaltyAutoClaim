// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

contract Counter {
    uint256 public number;

    event SetNumber(uint256 newNumber);

    function setNumber(uint256 newNumber) public {
        number = newNumber;
        emit SetNumber(newNumber);
    }

    function increment() public {
        number++;
    }
}
