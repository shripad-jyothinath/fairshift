// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AnchorRegistry
/// @notice Append-only registry of FairShift ledger Merkle roots.
/// @dev Deliberately minimal and ownerless. There is no update or delete path,
///      and no funds can be sent through the contract. Anyone may anchor a new
///      root; in practice the FairShift admin key is the only caller.
contract AnchorRegistry {
    /// @notice Unix timestamp at which a root was first anchored. Zero means unanchored.
    mapping(bytes32 => uint256) public anchoredAt;

    /// @notice Number of roots anchored so far. Also the 1-based anchor index.
    uint256 public count;

    /// @notice Emitted exactly once for every accepted Merkle root.
    /// @param index 1-based anchor index.
    /// @param root Merkle root over a consecutive range of ledger event hashes.
    /// @param label Human-readable range label, e.g. "block-0001-0042".
    /// @param publisher Account that submitted the anchor.
    /// @param timestamp Block timestamp at which the root was recorded.
    event Anchored(
        uint256 indexed index,
        bytes32 indexed root,
        string label,
        address indexed publisher,
        uint256 timestamp
    );

    /// @notice Anchor a new Merkle root.
    /// @param root Merkle root over a consecutive range of ledger event hashes.
    /// @param label Human-readable range label, e.g. "block-0001-0042".
    function anchor(bytes32 root, string calldata label) external {
        require(root != bytes32(0), "AnchorRegistry: zero root");
        require(anchoredAt[root] == 0, "AnchorRegistry: root already anchored");

        count += 1;
        anchoredAt[root] = block.timestamp;

        emit Anchored(count, root, label, msg.sender, block.timestamp);
    }
}
