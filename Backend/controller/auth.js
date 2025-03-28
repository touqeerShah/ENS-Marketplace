const { Header, Payload, SIWWeb3 } = require("@web3auth/sign-in-with-web3");
const jwt = require("jsonwebtoken");
let { getDataFromMongoDBExternal, loadMongo } = require("../utils/helper");
const { getKeys } = require("../module/keyStore");
const {
  registerWithSignature,
} = require("../controller/blockchainController.js");
const { keyEncrypt, keyDecrypt } = require("../module/encryption");

const domain = "localhost";
const origin = "https://localhost/login";
let jwtSecret = "test my £$@£ secret DSG U@t 123";
createWeb3Message = async (req, res) => {
  const header = new Header();
  header.t = "eip191";

  const payload = new Payload();
  payload.domain = domain;
  payload.address = req.body.address;
  payload.uri = origin;
  payload.statement = `This just for verification of account ${req.body.address}`;
  payload.version = "1";
  payload.chainId = req.body.chainId;

  const message = new SIWWeb3({
    header,
    payload,
    network: "ethereum", // allowed values "solana", "ethereum", "starkware"
  });
  // console.log("payload", payload);
  // return message.prepareMessage();
  res.send({
    status: 200,
    message: message.prepareMessage(),
    nonce: payload.nonce,
    issuedAt: payload.issuedAt,
    statement: payload.statement,
    chainId: payload.chainId,
    uri: payload.uri,
  });
};

async function verifyMessage(jsonPayload) {
  console.log("jsonPayload", jsonPayload);
  const { header, payload, signature, network } = JSON.parse(jsonPayload);
  const message = new SIWWeb3({
    header,
    payload,
    network,
  });
  return await message.verify(payload, signature, network);
}

const verify = async (req, res) => {
  console.log("reqreqreq", req.body);
  const isVerified = await verifyMessage(`{
    "header":{
       "t":"eip191"
    },
    "payload":{
       "domain":"${domain}",
       "address":"${req.body.address}",
       "statement":"${req.body.statement}",
       "uri":"${origin}",
       "version":"1",
       "chainId":${req.body.chainId},
       "nonce":"${req.body.nonce}",
       "issuedAt": "${req.body.issuedAt}"
    },
     "signature":{
        "s":"${req.body.signature}",
        "t":"eip191"
     },
     "network": "ethereum"
    }`);
  if (isVerified.success) {
    let response = {};
    if (!req.body.isUserExist) {
      let userReq = {
        body: {
          data: JSON.stringify({
            transactionCode: "001",
            apiName: "registerAdmin",
            parameters: {
              id: req.body.address,
              userRole: "test",
              status: "pending",
            },
            userId: req.body.address,
            companyId: "org1",
            organization: "org1",
            pinHash: req.body.pin,
          }),
        },
      };
      console.log(userReq.body.data);
      response = await registerWithSignature(userReq, res);

      console.log("response111", response);
    } else {
      console.log("isUserExist", req.body.isUserExist);
      var networkConfig = await getConfig(req.body.organization);
      if (networkConfig.data.status != 200) {
        res.send({ status: 400, message: "Error to connect Server Try again" });
        return networkConfig;
      } else {
        var getUser = {
          // query to check user is not exist
          _id: req.body.address,
        };
        let userIdentityRes = await getKeys(
          networkConfig.data.data.keyCounchdb.username,
          networkConfig.data.data.keyCounchdb.password,
          networkConfig.data.data.keyCounchdb.url,
          networkConfig.data.data.keyCounchdb.db_name,
          getUser
        );
        if (userIdentityRes.status != 200) {
          userIdentityRes.message = "user key already Found";
          res.send({ status: 401, message: "unregister user", data: true });
        }
        console.log("userIdentityRes", req.body.pin);
        response.key = JSON.parse(
          keyDecrypt(userIdentityRes.data.key, req.body.pin)
        );
        console.log("response.key", response.key);
        response.publicKey = response.key.credentials.privateKey;
      }
    }
    // if user is new
    // here we call register user function
    // also pass user pin hash for encryption
    // it will return public and we use it for token creation
    //else get public key only
    let verifiedAddress = req.body.address;
    let organization = req.body.organization;
    const token = jwt.sign(
      { verifiedAddress, organization },
      response.publicKey,
      { expiresIn: "15m", algorithm: "ES256" }
    );
    res.send({ status: 200, data: token });
    console.log("Verified!");
  } else {
    res.send({ status: 400, message: "unable to verify signature" });

    console.log("Not Verified!");
  }
};

async function getConfig(organization, res) {
  let client = await loadMongo();
  var networkConfig = await getDataFromMongoDBExternal(
    client,
    "Network",
    { name: organization },
    res
  );

  return networkConfig;
}

const checkUserExist = async (req, res) => {
  let client = await loadMongo();
  var networkConfig = await getConfig(req.body.organization, res);
  // console.log(networkConfig.data);
  if (networkConfig.data.status != 200) {
    res.send({ status: 400, message: "Error to connect Server Try again" });
    return networkConfig;
  } else {
    try {
      var getUser = {
        // query to check user is not exist
        _id: req.body.address,
      };
      var userIdentityRes = await getKeys(
        networkConfig.data.data.keyCounchdb.username,
        networkConfig.data.data.keyCounchdb.password,
        networkConfig.data.data.keyCounchdb.url,
        networkConfig.data.data.keyCounchdb.db_name,
        getUser
      );
      if (userIdentityRes.status == 200) {
        userIdentityRes.message = "user key already Found";
        res.send({ status: 200, message: "user exit", data: true });
        return;
      } else {
        res.send({ status: 404, message: "user not exit", data: false });

        return;
      }
    } catch (error) {
      // }
    }
  }
};
async function verifyPin(req, res, next) {
  try {
    const authHeader = req.headers["authorization"];
    let token = authHeader.split(" ")[1];
    var networkConfig = await getConfig(req.body.organization);
    if (networkConfig.data.status != 200) {
      res.send({ status: 400, message: "Error to connect Server Try again" });
      return networkConfig;
    } else {
      let response = {};
      var getUser = {
        // query to check user is not exist
        _id: req.body.address,
      };
      let userIdentityRes = await getKeys(
        networkConfig.data.data.keyCounchdb.username,
        networkConfig.data.data.keyCounchdb.password,
        networkConfig.data.data.keyCounchdb.url,
        networkConfig.data.data.keyCounchdb.db_name,
        getUser
      );
      if (userIdentityRes.status != 200) {
        userIdentityRes.message = "user key already Found";
        res.send({ status: 401, message: "unregister user", data: true });
      }
      console.log("userIdentityRes", userIdentityRes.data.key);
      response.key = JSON.parse(
        keyDecrypt(userIdentityRes.data.key, req.body.pin)
      );

      jwt.verify(
        token,
        userIdentityRes.data.publicKey,
        { algorithm: "ES256" },
        (err, authData) => {
          console.log("authData", authData);

          if (err) return res.sendStatus(403);

          req.authData = authData;
          if (!authData) {
            res.send({ status: 404, message: authData });
          }
          res.send({ status: 200, message: authData });
          next();
        }
      );
    }
  } catch (error) {
    console.log("error", error);
    res.send({ status: 404, message: "Not Valid" });
  }
}
async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  let token = authHeader.split(" ")[1];
  try {
    var networkConfig = await getConfig(req.body.organization);
    if (networkConfig.data.status != 200) {
      res.send({ status: 400, message: "Error to connect Server Try again" });
      return networkConfig;
    } else {
      var getUser = {
        // query to check user is not exist
        _id: req.body.address,
      };
      var userIdentityRes = await getKeys(
        networkConfig.data.data.keyCounchdb.username,
        networkConfig.data.data.keyCounchdb.password,
        networkConfig.data.data.keyCounchdb.url,
        networkConfig.data.data.keyCounchdb.db_name,
        getUser
      );
      if (userIdentityRes.status != 200) {
        userIdentityRes.message = "user key already Found";
        res.send({ status: 401, message: "unregister user", data: true });
      } else {
        if (token == null) return res.sendStatus(401);
        // console.log("userIdentityRes", userIdentityRes);
        // const header = jwt.decode(token, userIdentityRes.data.publicKey, { algorithm: true }).header;
        // console.log("header", header);
        // console.log("userIdentityRes.data.publicKey", userIdentityRes.data.publicKey);
        // let decode=jwt.decode(token, userIdentityRes.data.publicKey, { algorithm: 'ES256' })
        jwt.verify(
          token,
          userIdentityRes.data.publicKey,
          { algorithm: "ES256" },
          (err, authData) => {
            console.log("authData", authData);

            if (err) return res.sendStatus(403);

            req.authData = authData;
            if (!authData) {
              res.send({ status: 404, message: authData });
            }
            res.send({ status: 200, message: authData });
            next();
          }
        );
      }
    }
  } catch (error) {
    console.log(error);
    res.send({ status: 503, message: "Service Unavailable", data: true });
  }
}
module.exports = {
  createWeb3Message,
  verify,
  authenticateToken,
  checkUserExist,
  verifyPin,
};
