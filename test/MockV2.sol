// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract MockV2 is UUPSUpgradeable, OwnableUpgradeable {
    constructor() {
        _disableInitializers();
    }

    function initialize(address _owner) public reinitializer(2) {
        __Ownable_init(_owner);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
