// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor(address owner, uint256 amount) ERC20("RoyaltyAutoClaim", "RAC") {
        _mint(owner, amount);
    }
}
