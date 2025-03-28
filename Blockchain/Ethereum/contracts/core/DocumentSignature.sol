// contracts/Box.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./../interfaces/IDocumentSignature.sol";

contract DocumentSignature is Ownable, IDocumentSignature, EIP712, ERC721URIStorage {
    using Counters for Counters.Counter;
    Counters.Counter private idCount;
    mapping(uint256 => DocumentDetials) documentDetials;
    address userIdentityNFT;
    bytes32 public constant CAST_VOTE =
        keccak256("createDocument(address creator,uint256 documentId,string uri)");

    modifier onlyDocumentOwner(address owner) {
        if (owner != msg.sender) {
            revert DocumentSignature__OnlyOwnerCanCall();
        }
        _;
    }

    constructor(
        address _userIdentityNFT,
        string memory name,
        string memory symbol,
        string memory signingDomain,
        string memory signatureVersion
    ) ERC721(name, symbol) EIP712(signingDomain, signatureVersion) {
        userIdentityNFT = _userIdentityNFT;
    }

    function createDocument(
        bytes memory name,
        bytes memory description,
        string memory uri,
        uint64 signatureStartingPeriod,
        uint64 signatureEndingingPeriod,
        uint256[] memory partiesTokenId
    ) public {
        if (ERC721(userIdentityNFT).balanceOf(msg.sender) != 1) {
            revert DocumentSignature__CreatorIdentityNotExit(msg.sender);
        }
        if (signatureEndingingPeriod == signatureStartingPeriod) {
            revert DocumentSignature__StartingAndEndingValuesNotSome(
                signatureEndingingPeriod,
                signatureStartingPeriod
            );
        }
        idCount.increment();
        // mapping(uint256 => SignatureStatus) storage parties;
        uint256 tokenId = idCount.current();
        uint256 documentId = getDocumentId(msg.sender, name, description, partiesTokenId);

        DocumentDetials storage _documentDetials = documentDetials[documentId];
        for (uint256 index = 0; index < partiesTokenId.length; index++) {
            Party memory p = Party(partiesTokenId[index], SignatureStatus.Pending, new bytes(0));
            // _documentDetials.parties[partiesTokenId[index]] = SignatureStatus.Deafult;
            _documentDetials.parties.push(p);
        }
        uint64 starting = toUint64(block.number) + signatureStartingPeriod;
        _documentDetials.signatureStart = starting;
        _documentDetials.signatureEnd = starting + signatureEndingingPeriod;
        _documentDetials.name = name;
        _documentDetials.creator = msg.sender;
        _documentDetials.description = description;
        _documentDetials.status = DocumentState.Pending;
        _documentDetials.tokenId = tokenId;
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, uri);
        emit DocumentedCrearted(tokenId, documentId, msg.sender);
    }

    function processDocumentWithSignature(
        DocumentDetialsWithSigature calldata documentDetialsWithSigature
    ) public {
        // this.onlyDocumentOwner(documentDetials.creator);
        // here we get signature response but oracle from off-chain

        DocumentState status = getStatusSignDocument(
            documentDetialsWithSigature.status,
            documentDetialsWithSigature.signatureStart,
            documentDetialsWithSigature.signatureEnd
        );
        if (status == DocumentState.Queued) {
            for (uint i = 0; i < documentDetialsWithSigature.parties.length; i++) {
                address signer = verifification(
                    documentDetialsWithSigature.creator,
                    documentDetialsWithSigature.documentId,
                    documentDetialsWithSigature.uri,
                    documentDetialsWithSigature.parties[i].signatures
                );
                require(
                    (signer ==
                        ERC721(userIdentityNFT).ownerOf(
                            documentDetialsWithSigature.parties[i].tokenId
                        )),
                    "User Signature is Invalid "
                );
                // if (
                //     signer !=
                //     ERC721(userIdentityNFT).ownerOf(documentDetialsWithSigature.parties[i].tokenId)
                // ) {
                //     revert DocumentSignature__InValidSignature(
                //         documentDetialsWithSigature.parties[i].tokenId
                //     );
                // }
            }
            // uint256 tokenId = idCount.current();

            _safeMint(msg.sender, documentDetialsWithSigature.documentId);
            _setTokenURI(documentDetialsWithSigature.documentId, documentDetialsWithSigature.uri);
            // documentDetials.status = DocumentState.Succeeded;
            emit DocumentProcessWithSignature(
                documentDetialsWithSigature.documentId,
                DocumentState.Succeeded
            );

            // emit DocumentProcess(documentId, isValidation);
        } else {
            revert DocumentSignature__NotProcessBecauseNotInQueue();
        }
    }

    // function processDocument(
    //     uint256 documentId,
    //     // uint256[] memory tokenIds,
    //     bytes[] calldata signatures,
    //     bool isValidation
    // ) public onlyDocumentOwner(documentDetials[documentId].creator) {
    //     // here we get signature response but oracle from off-chain
    //     if (documentDetials[documentId].parties.length != signatures.length)
    //         revert DocumentSignature__InvalidSignatureArrayLength();
    //     DocumentState status = getStatus(documentId);
    //     if (status == DocumentState.Queued) {
    //         bool isAllvalid = true;
    //         for (uint i = 0; i < documentDetials[documentId].parties.length; i++) {
    //             address signer = verifification(
    //                 documentDetials[documentId].parties[i].tokenId,
    //                 documentId,
    //                 super.tokenURI(1),
    //                 signatures[i]
    //             );
    //             if (
    //                 isValidation &&
    //                 signer !=
    //                 ERC721(userIdentityNFT).ownerOf(documentDetials[documentId].parties[i].tokenId)
    //             ) {
    //                 revert DocumentSignature__InValidSignature(
    //                     documentDetials[documentId].parties[i].tokenId
    //                 );
    //             }
    //             if (
    //                 !isValidation &&
    //                 signer !=
    //                 ERC721(userIdentityNFT).ownerOf(documentDetials[documentId].parties[i].tokenId)
    //             ) {
    //                 documentDetials[documentId].parties[i].status = SignatureStatus.InValid;
    //                 isAllvalid = false;
    //             } else {
    //                 documentDetials[documentId].parties[i].status = SignatureStatus.Valid;
    //             }
    //         }
    //         if (isAllvalid) {
    //             documentDetials[documentId].status = DocumentState.Succeeded;
    //         } else {
    //             documentDetials[documentId].status = DocumentState.Executed;
    //         }
    //         emit DocumentProcess(documentId, isValidation);
    //     } else {
    //         revert DocumentSignature__NotProcessBecauseNotInQueue();
    //     }
    // }

    function getDocumentDetails(uint256 documentId) public view returns (DocumentDetials memory) {
        DocumentDetials memory _documentDetails = documentDetials[documentId];
        _documentDetails.status = getStatus(documentId);
        return _documentDetails;
    }

    function checkMyCastedVote(uint256 documentId) public view returns (SignatureStatus) {
        bool isNotExist = false;
        for (uint i = 0; i < documentDetials[documentId].parties.length; i++) {
            if (
                msg.sender ==
                ERC721(userIdentityNFT).ownerOf(documentDetials[documentId].parties[i].tokenId)
            ) {
                return documentDetials[documentId].parties[i].status;
            }
        }
        if (!isNotExist) {
            revert DocumentSignature__UserNotExist();
        }
        return SignatureStatus.Deafult;
    }

    function getDocumentStartingTime(uint256 documentId) public view returns (uint256) {
        return documentDetials[documentId].signatureStart;
    }

    function getDocumentEndingingTime(uint256 documentId) public view returns (uint256) {
        return documentDetials[documentId].signatureEnd;
    }

    function getStatusSignDocument(
        DocumentState status,
        uint256 signatureStart,
        uint256 signatureEnd
    ) public view returns (DocumentState) {
        if (status == DocumentState.Succeeded || status == DocumentState.Executed) {
            return status;
        }

        if (signatureStart > toUint64(block.number)) {
            return DocumentState.Pending;
        }
        if (signatureStart <= toUint64(block.number) && signatureEnd > toUint64(block.number)) {
            return DocumentState.Active;
        }
        if (signatureEnd < toUint64(block.number)) {
            return DocumentState.Queued;
        }
        return DocumentState.Pending;
    }

    function getStatus(uint256 documentId) public view returns (DocumentState) {
        if (
            documentDetials[documentId].status == DocumentState.Succeeded ||
            documentDetials[documentId].status == DocumentState.Executed
        ) {
            return documentDetials[documentId].status;
        }

        if (documentDetials[documentId].signatureStart > toUint64(block.number)) {
            return DocumentState.Pending;
        }
        if (
            documentDetials[documentId].signatureStart <= toUint64(block.number) &&
            documentDetials[documentId].signatureEnd > toUint64(block.number)
        ) {
            return DocumentState.Active;
        }
        if (documentDetials[documentId].signatureEnd < toUint64(block.number)) {
            return DocumentState.Queued;
        }
        return DocumentState.Pending;
    }

    function getCurrentTime() public view returns (uint256) {
        return toUint64(block.number);
    }

    function verifification(
        address creator,
        uint256 documentId,
        string calldata uri,
        bytes calldata signature
    ) public view returns (address) {
        bytes32 digest = _hash(creator, documentId, uri);
        return ECDSA.recover(digest, signature);
    }

    function _hash(
        address creator,
        uint256 documentId,
        string calldata uri
    ) internal view returns (bytes32) {
        return
            _hashTypedDataV4(
                keccak256(abi.encode(CAST_VOTE, creator, documentId, keccak256(bytes(uri))))
            );
    }

    function getDocumentId(
        address creator,
        bytes memory name,
        bytes memory description,
        uint256[] memory partiesTokenId
    ) public view returns (uint256) {
        return
            uint256(
                keccak256(abi.encode(creator, name, description, partiesTokenId, block.timestamp))
            );
    }

    function toUint64(uint256 value) internal pure returns (uint64) {
        require(value <= type(uint64).max, "SafeCast: value doesn't fit in 64 bits");
        return uint64(value);
    }
}
