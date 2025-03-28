/*
 * SPDX-License-Identifier: Apache-2.0
 */

"use strict";

const { Gateway, Wallets } = require("fabric-network");
const fs = require("fs");
const path = require("path");

async function main(arr) {
  try {
    // load the network configuration
    const ccpPath = path.resolve(
      __dirname,
      "..",
      "connection",
      "connection-org1.json"
    );

    let ccp = JSON.parse(fs.readFileSync(ccpPath, "utf8"));

    // Create a new file system based wallet for managing identities.
    const walletPath = path.join(process.cwd(), "wallet");
    const wallet = await Wallets.newFileSystemWallet(walletPath);
    console.log(`Wallet path: ${walletPath}`);

    // Check to see if we've already enrolled the user.
    const identity = await wallet.get("system2");
    if (!identity) {
      console.log(
        'An identity for the user "system" does not exist in the wallet'
      );
      console.log("Run the registerUser.js application before retrying");
      return;
    }

    // Create a new gateway for connecting to our peer node.
    const gateway = new Gateway();
    await gateway.connect(ccp, {
      wallet,
      identity: "system2",
      discovery: { enabled: true, asLocalhost: true },
    });

    // Get the network (channel) our contract is deployed to.
    const network = await gateway.getNetwork("mychannel");

    const mspId = network.getGateway().getIdentity().mspId;
    const myOrgPeers = network.getChannel().getEndorsers(mspId);
    // console.log(myOrgPeers);
    // Get the contract from the network.
    const contract = network.getContract("company-registration");

    let result = await contract
      .createTransaction("updateDeliveryOrReceiptStatus")
      .setEndorsingPeers(myOrgPeers)
      .submit(arr);
    console.log("result", result);
    var response_object = {};
    var response = JSON.parse(result.toString());
    if (response["code"]) {
      response_object.status = response["code"];
      response_object.message = response["message"];
    } else {
      response_object.status = 200;
      response_object.message = "SUCCESS";
      response_object.data = JSON.parse(result.toString());
    }
    console.log(
      `Transaction has been evaluated, result is: ${JSON.stringify(
        response_object
      )}`
    );

    console.log("Transaction has been submitted");

    // Disconnect from the gateway.
    await gateway.disconnect();
  } catch (error) {
    var firstIndex = error.message.indexOf('{"message":');
    var endingIndex = error.message.indexOf('"}', firstIndex);
    let result = error.message.substring(firstIndex, endingIndex + 2);
    console.log("result", result);
    var response_object = {};
    var response = JSON.parse(result);
    if (response["code"]) {
      response_object.status = response["code"];
      response_object.message = response["message"];
    } else {
      response_object.status = 200;
      response_object.message = "SUCCESS";
      response_object.data = JSON.parse(result.toString());
    }
    console.log(`response: ${JSON.stringify(response_object)}`);
    process.exit(1);
  }
}

check();
async function check() {
  // for (let index = 40; index < 60; index++) {
  // var arr =
  //   '{"documentId": "documentId.toString()' +
  //   index +
  //   '","documentName": "documentName","purpose": "purpose","uri": "uri","startData": "1","expirationDate": "1","startBlock": "1","endBlock": "1","creator": "web3ProviderState.address","ownerSignature": "voucher","parties": [1,2]}';
  //Create Lot ==> '{"lotId":"pharmaTrace1-lot200001","productId":"786","drugId":"test","lotNumber": "pharmatrace","batchLotData":"[]","expirationDate": "expirationDate","manufacturingDate": "manufacturingDate","manufacturingSite": "manufacturingSite","lotType":"Lot"}'
  //{"lotId":"pharmaTrace1-lot9","itemsId":"item6"}
  //mergeLotsItemObject => {"lotIdFrom":"pharmaTrace1-lot200001","lotIdTo":"pharmaTrace1-lot200002"}
  // createDeliveryOrReceipt '{"lotId":["pharmaTrace1-lot200002"],"deliveryId":"delivery1","from":"GLN1","to":"GLN2","items":["item200002"],"type":"delivery","status":"activated"}'

  await main(
    '{"deliveryId":"delivery1","items":["item200002"],"status":"deactivated"}'
  );

  // }
}
