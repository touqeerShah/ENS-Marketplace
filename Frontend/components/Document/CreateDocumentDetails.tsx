import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from 'next/router'

import { useApolloClient } from "@apollo/client";
import { ethers, Signer } from "ethers";
import { toast } from "react-toastify";
import CryptoJS from 'crypto-js';

import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as Yup from "yup";
import { create } from "ipfs-http-client";
import { faFingerprint, faFile, faPlusCircle, faUpload, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import AddParameter from "../TextField/AddSingner"
import { TypeDocumentSignerFields } from "../../class/document"
import { Contract } from "@ethersproject/contracts";
import { IssueDigitalIdentity } from "./../../class/subgraphResponse";

// components

import SetPin from "./../Pin/SetPin"

import { ContractAddress } from "../../config/"
import { CHECK_SIGNER_EXIST } from "./../../lib/subgrapQueries"
import { StateType, PinState, PinHash } from "../../config"
import { useAppSelector, useAppDispatch } from "./../../redux/hooks"
import { web3ProviderReduxState } from "./../../redux/reduces/web3ProviderRedux"
import { pinStateReducerState, changeState } from "./../../redux/reduces/pinRedux"
import { pinHashReducerState, setHash } from "./../../redux/reduces/pinhashRedux"
import { store } from "./../../redux/store"

import { getDocumentSignature, getUserIdentityNFT } from "../../lib/getDeploy";
import { createDocument } from "../../lib/createVoucher"
import { getStringToBytes } from "../../lib/convert";
import { post } from "../../utils"
import {
  DS_SIGNING_DOMAIN_NAME,
  DS_SIGNING_DOMAIN_VERSION,
  AVERAGE_BLOCK_MINT_TIME,
  INFURA_URL,
  INFURA_IPFS_PROJECJECT_ID,
  INFURA_IPFS_PROJECJECT_SECRET,
} from "../../lib/config"
import { REDEEM_USER_NFT } from "./../../lib/subgrapQueries";

import { getLatestBlockNumber } from "./../../lib/alchemy"
export default function CreateDocumentDetails(props: any) {
  // console.log("CreateDocumentDetails =>", props);
  const router = useRouter()

  let web3ProviderState: StateType = useAppSelector(web3ProviderReduxState);
  let pinState: PinState = useAppSelector(pinStateReducerState);
  let pinHash: PinHash = useAppSelector(pinHashReducerState);

  const validationSchema = Yup.object().shape({
    // image: Yup.string().required("NFG image is required"),
  });
  const subgraphClient = useApolloClient();

  const formOptions = { resolver: yupResolver(validationSchema) };
  const { register, handleSubmit, formState } = useForm(formOptions);
  const [url, setURL] = useState("")
  const [documentId, setDocumentId] = useState("")
  // const [documentName, setDocumentName] = useState("")
  // const [purpose, setPurpose] = useState("")
  // const [startDate, setStartDate] = useState("")
  // const [endDate, setEndDate] = useState("")
  // let documentName: string;
  // let purpose: string;
  // let startDate: string;
  // let endDate: string;

  //check pin
  const [checkPin, setCheckPin] = React.useState(false);
  const [showModal, setShowModal] = React.useState(false);
  const [pin, setPin] = React.useState("");
  let isRequest = false;
  let [spinnerProcess, setSpinnerProcess] = useState(false);

  const dispatch = useAppDispatch();
  // var buffer = new ArrayBuffer(0);

  // let [fileBuffer, setFileBuffer] = useState(buffer);
  // let [fileName, setFileName] = useState("");
  const myRef: React.LegacyRef<HTMLInputElement> = React.createRef();

  const [documentSignatureContract, setDocumentSignatureContract] = useState<Contract>()
  const [userIdentityNFTContract, setUserIdentityNFTContract] = useState<Contract>()

  const projectIdAndSecret = `${INFURA_IPFS_PROJECJECT_ID}:${INFURA_IPFS_PROJECJECT_SECRET}`;
  const client = create({
    host: INFURA_URL,
    port: 5001,
    protocol: "https",
    headers: {
      authorization: `Basic ${Buffer.from(projectIdAndSecret).toString(
        "base64"
      )}`,
    },
  });

  // here we check token is not expired
  const getVerifyToken = useCallback(async function (pin: string,) {
    let openPinModule = false
    console.log(web3ProviderState.active, "getVerifyToken", pin);

    // if (pinState.toSavePin) {
    //   dispatch(changeState({ status: !pinState.status, toSavePin: false }))
    // }
    if (web3ProviderState.active) {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': "JWT " + localStorage.getItem("token")
      }
      let res = await post(`auth/verify-pin`, {
        address: web3ProviderState.account,
        organization: "org1",
        pin: pin

      }, { headers: headers });
      console.log("Token Verifcation Result = = = = = = >", res);
      if (res.status == 400) {
        setCheckPin(false)
        setPin("")
        setShowModal(false)
        dispatch(changeState({ status: !pinState.status, toSavePin: true }))
        toast.info("Token Expire")
      } else {
        dispatch(changeState({ status: true, toSavePin: true }))
        dispatch(setHash({ pinhash: pin }))
        setShowModal(openPinModule)
      }
    }
  }, [web3ProviderState]);



  // call when user provide Pin for verifications
  useEffect(() => {
    const fetchData = async () => {
      try {
        // console.log("sasa", CryptoJS.MD5("pin").toString());
        await getVerifyToken(CryptoJS.MD5("pin").toString())
      } catch (error: any) {
        console.log(error);

        return;

      }
    }
    console.log("checkPin && pin.length == 6", checkPin && pin.length == 6, checkPin, pin.length == 6);

    if (checkPin && pin.length == 6 && !isRequest) {
      isRequest = true
      fetchData()
    }
  }, [checkPin])

  useEffect(() => {
    const fetchData = async () => {
      try {
        dispatch(changeState({ status: false, toSavePin: true }))
        await storeDocument(pinHash.pinhash, props)
      } catch (error: any) {
        console.log(error);

        return;

      }
    }
    console.log("storeDocument =>>>", pinState.toSavePin, pinHash.pinhash, props.documentName);

    if (store.getState().pinState.status && store.getState().pinHash.pinhash != "" && props.documentName != "") {
      fetchData()
    }
  }, [pinHash, props])


  const storeDocument = useCallback(async (pin: string, props: any) => {
    let documentSignatureContract = await getDocumentSignature(web3ProviderState.library)
    let userIdentityNFTContract = await getUserIdentityNFT(web3ProviderState.library)
    console.log("2. storeDocument:= ", props.documentName, props.purpose, props.startDate, props.endDate);


    setDocumentSignatureContract(documentSignatureContract)
    setUserIdentityNFTContract(userIdentityNFTContract)
    console.log("storeDocument", web3ProviderState.active, web3ProviderState.account, documentSignatureContract, props.fileBuffer);
    // console.log("=-===---=-==->", documentName, purpose, startDate, endDate);

    if (!web3ProviderState.active == null && web3ProviderState.account) {
      console.log("error");
      setSpinnerProcess(false)

      toast.error("Please Connect to your wallet First");
      return;
    }
    if (web3ProviderState.chainId != 5) {
      setSpinnerProcess(false)

      toast.error("Please Change your network to Goerli");
      return;
    }
    let voucher: string;

    if (web3ProviderState.active && web3ProviderState.account && documentSignatureContract) {
      let latestBlockNumber = await getLatestBlockNumber()
      var currentDate = new Date("2023-03-04");
      var startDateSeconds = (new Date(props.startDate).getTime() - currentDate.getTime()) / 1000;
      var endDateSeconds = (new Date(props.endDate).getTime() - currentDate.getTime()) / 1000;
      var startBlock = latestBlockNumber + 1// latestBlockNumber + (startDateSeconds / AVERAGE_BLOCK_MINT_TIME)// this logic for production but we are doing for testing
      var endBlock = latestBlockNumber + 50//startBlock + (endDateSeconds / AVERAGE_BLOCK_MINT_TIME)

      // const signer = await web3ProviderState.active.getSigner();
      let parties: TypeDocumentSignerFields[] = props.documentSignerFieldsState as TypeDocumentSignerFields[]
      console.log("parties", parties);
      let partiesId: number[] = []
      try {


        for (let index = 0; index < parties.length; index++) {
          const party: TypeDocumentSignerFields = parties[index];
          console.log(party);

          if (party.userId != "" && userIdentityNFTContract) {
            let tokenId: number = parseInt(party.userId)
            console.log("tokenId", tokenId.toString());
            const isExist = await subgraphClient.query({
              query: CHECK_SIGNER_EXIST,
              variables: {
                tokenId: tokenId.toString(),
              },
            });
            console.log("isExist", isExist);
            // issueDigitalIdentities

            if (isExist.data?.issueDigitalIdentities.length > 0) {
              //check from sub graph party token exist or not
              partiesId.push(tokenId)
            } else {
              toast.info(`User Token ${tokenId} Not Exist`);
              return;
            }
          }
        }
        console.log("partiesId", partiesId);

      } catch (error) {
        console.log(error);
        setSpinnerProcess(false)

        toast.info(`User Token Not Exist`);
        return;
      }


      if (userIdentityNFTContract && 0 == await userIdentityNFTContract.balanceOf(web3ProviderState.account)) {
        setSpinnerProcess(false)
        toast.error("Verify  Your Identity First");
        return;
      }

      if (partiesId.length > 0) {
        const type = props.fileName.substring(props.fileName.lastIndexOf(".") + 1, props.fileName.length)
        console.log("type", type);

        const base64data = Buffer.from(props.fileBuffer).toString('base64')
        const file: string = `data:${type};base64,` + base64data
        let _documentId: any = 0;
        // console.log(file);

        if (documentId == "") {
          console.log("documentIddocumentIddocumentId", documentId);

          try {
            const _documentName = getStringToBytes(props.documentName)
            const _purpose = getStringToBytes(props.purpose)

            _documentId = await documentSignatureContract.getDocumentId(web3ProviderState.account, _documentName, _purpose, partiesId)
            console.log("documentId", _documentId);

            setDocumentId(_documentId.toString())
          } catch (error: any) {
            console.log("getDocumentId error ", error);
            toast.error(error.message.substring(0, error.message.indexOf("(")))
            return;
          }
        } else {
          _documentId = (documentId)
        }
        let documentName = props.documentName
        let fileName = props.fileName
        let purpose = props.purpose
        let imageObject = JSON.stringify({
          documentId: _documentId.toString(),
          documentName,
          purpose,
          file: file,
          fileName,
          startBlock,
          endBlock,
          creator: web3ProviderState.account,
          signer: partiesId,
        })
        console.log("imageObject", imageObject);

        let uri: string = ""
        try {
          const added = await client.add(imageObject);

          uri = `https://ai-nft.infura-ipfs.io/ipfs/${added.path}`
          console.log("uri", uri);

          setURL(uri)
        } catch (error) {
          toast.error("something is wrong with IPFS")
          return "";
        }
        let signer = web3ProviderState.library?.getSigner()

        if (signer) {
          try {

            voucher = (await createDocument(
              signer,
              web3ProviderState.account,
              uri,
              _documentId,
              DS_SIGNING_DOMAIN_NAME,
              DS_SIGNING_DOMAIN_VERSION,
              web3ProviderState.chainId.toString(),
              ContractAddress.UserIdentityNFT
            )) as string;

            console.log("url", url);

            console.log("voucher", voucher);
            const issueDigitalIdentity = await subgraphClient.query({
              query: REDEEM_USER_NFT,
              variables: {
                userAddress: web3ProviderState.account,
              },
            });
            let tem: any;
            if (issueDigitalIdentity.data?.issueDigitalIdentities.length > 0) {
              tem = issueDigitalIdentity.data?.issueDigitalIdentities[0] as IssueDigitalIdentity
            }
            if (tem) {
              let res = await post("api/addQueue", {
                data: JSON.stringify({
                  transactionCode: "002",
                  apiName: "createDocument",
                  parameters: {
                    documentId: _documentId.toString(),
                    documentName: props.documentName,
                    purpose: props.purpose,
                    uri: uri,
                    startData: props.startDate,
                    expirationDate: props.endDate,
                    startBlock: startBlock.toString(),
                    endBlock: endBlock.toString(),
                    creator: web3ProviderState.account,
                    ownerSignature: voucher,
                    parties: partiesId,
                    creatorTokenId: tem?.tokenId
                  },
                  pinHash: pin,
                  userId: web3ProviderState.account,
                  organization: "org1"
                })
              });
              console.log("res", res);

            }

            toast.success("Successfully Created Document " + _documentId.toString())
            setSpinnerProcess(false)
            router.push("/user/listDocument")


          } catch (error: any) {
            setSpinnerProcess(false)

            console.log(error.message.substring(0, error.message.indexOf("("))); // "Hello"
            toast.error(error.message.substring(0, error.message.indexOf("(")))
          }
        } else {
          toast.error("Signer Account Not Found")
        }

      } else {
        setSpinnerProcess(false)

        toast.error("Atleast One Signer");

      }


    }

  }, [web3ProviderState]);


  let signDocument = useCallback((event: any) => {

    console.log("signDocument", props.documentName, props.purpose, props.startDate, props.endDate);
    setSpinnerProcess(true)

    if (localStorage.getItem("token")) {
      setShowModal(true)
    } else {
      console.log("pinState.status", pinState.status);
      dispatch(changeState({ status: !pinState.status, toSavePin: true }))
    }

  }, [])
  return (
    <>
      <div className="relative border-2 flex flex-col min-w-0 break-words w-full mt-6 shadow-lg rounded-lg bg-blueGray-100 border-0">

        <><div className="rounded-t bg-white mb-0 px-6 py-6">
          <div className="text-center flex justify-between">
            <h6 className="text-blueGray-700 text-xl font-bold">Create Document</h6>

          </div>
        </div>
          <div className="flex-auto px-4 lg:px-10 py-10 pt-0">
            <form
              onSubmit={handleSubmit(signDocument)}
            >
              <h6 className="text-blueGray-400 text-sm mt-3 mb-6 font-bold uppercase">
                Dcoument Details
              </h6>
              <div className="flex flex-wrap">
                <div className="w-full lg:w-6/12 px-4">
                  <div className="relative w-full mb-3">
                    <label
                      className="block uppercase text-blueGray-600 text-xs font-bold mb-2"
                      htmlFor="grid-password"
                    >
                      Document Id
                    </label>
                    <input
                      type="text"
                      className="border-0 px-3 py-3 placeholder-blueGray-300 text-blueGray-600 bg-white rounded text-sm shadow focus:outline-none focus:ring w-full ease-linear transition-all duration-150"
                      defaultValue={documentId}
                      onChange={(e: React.FormEvent<HTMLInputElement>) => {
                        // setDocumentId(e.currentTarget.value)
                      }}
                      readOnly
                    />
                  </div>
                </div>
                <div className="w-full lg:w-6/12 px-4">
                  <div className="relative w-full mb-3">
                    <label
                      className="block uppercase text-blueGray-600 text-xs font-bold mb-2"
                      htmlFor="grid-password"
                    >
                      Document Name
                    </label>
                    <input
                      type="text"
                      className="border-0 px-3 py-3 placeholder-blueGray-300 text-blueGray-600 bg-white rounded text-sm shadow focus:outline-none focus:ring w-full ease-linear transition-all duration-150"
                      defaultValue=""
                      id="DocumentName"
                      onChange={(e: React.FormEvent<HTMLInputElement>) => {
                        props.setDocumentName(e.currentTarget.value)
                        // documentName = e.currentTarget.value
                      }}
                    />
                  </div>
                </div>
                <div className="w-full lg:w-full px-4">
                  <div className="relative w-full mb-3">
                    <label
                      className="block uppercase text-blueGray-600 text-xs font-bold mb-2"
                      htmlFor="grid-password"
                    >
                      Purpose
                    </label>

                    <textarea className="border-0 px-3 py-3 placeholder-blueGray-300 text-blueGray-600 bg-white rounded text-sm shadow focus:outline-none focus:ring w-full ease-linear transition-all duration-150"
                      id="w3review" name="w3review" rows={4} cols={50}
                      onChange={(e: any) => {
                        props.setPurpose(e.currentTarget.value)
                        // purpose = e.currentTarget.value

                      }}
                    ></textarea>
                  </div>
                </div>
                <hr className="mt-6 border-b-1 border-blueGray-300" />
                {props.documentSignerFieldsState && <> <h6 className="text-blueGray-400 w-4/5	 text-sm mt-3 mb-6 font-bold uppercase">
                  Signer
                </h6>
                  <div className="w-1/5	 py-2.5">
                    <div className="relative  center ">
                      <button className="border-0 py-2.5  my-4 placeholder-blueGray-300 text-blueGray-600 bg-white rounded border-2 text-sm shadow focus:outline-none focus:ring w-full ease-linear transition-all duration-150"
                        type="button"

                        onClick={() => props.addParameterFields()}>
                        <FontAwesomeIcon icon={faPlusCircle} />{" "}
                      </button>
                    </div>
                  </div></>
                }      {props.documentSignerFieldsState && props.documentSignerFieldsState.map((fields: TypeDocumentSignerFields, index: number) => (

                  <AddParameter key={index} documentSignerFieldsState={props.documentSignerFieldsState}
                    setDocumentSignerFieldsState={props.setDocumentSignerFieldsState} id={fields.id} />))}
                <div className="w-full lg:w-6/12 px-4">
                  <div className="relative w-full mb-3">
                    <label
                      className="block uppercase text-blueGray-600 text-xs font-bold mb-2"
                      htmlFor="grid-password"
                    >
                      Signature Start
                    </label>
                    <input
                      type="date"
                      className="border-0 px-3 py-3 placeholder-blueGray-300 text-blueGray-600 bg-white rounded text-sm shadow focus:outline-none focus:ring w-full ease-linear transition-all duration-150"
                      defaultValue=""
                      onChange={(e: React.FormEvent<HTMLInputElement>) => {
                        props.setStartDate(e.currentTarget.value)
                      }}
                    />
                  </div>
                </div>
                <div className="w-full lg:w-6/12 px-4">
                  <div className="relative w-full mb-3">
                    <label
                      className="block uppercase text-blueGray-600 text-xs font-bold mb-2"
                      htmlFor="grid-password"
                    >
                      Signature End
                    </label>
                    <input
                      type="date"
                      className="border-0 px-3 py-3 placeholder-blueGray-300 text-blueGray-600 bg-white rounded text-sm shadow focus:outline-none focus:ring w-full ease-linear transition-all duration-150"
                      defaultValue=""
                      onChange={(e: React.FormEvent<HTMLInputElement>) => {
                        props.setEndDate(e.currentTarget.value)
                      }}
                    />
                  </div>
                </div>
                <div className="w-full lg:w-9/12 px-4">


                  <div className="relative w-full mb-3">
                    <label
                      className="block uppercase text-blueGray-600 text-xs font-bold mb-2"
                      htmlFor="grid-password"
                    >
                      Sign Document
                    </label>
                    <input
                      type="text"
                      ref={myRef}
                      className="border-0 px-3 py-3 placeholder-blueGray-300 text-blueGray-600 bg-white rounded text-sm shadow focus:outline-none focus:ring w-full ease-linear transition-all duration-150"
                      defaultValue={props.fileName}
                      readOnly
                    />
                    {/* <a download="Book1.xlsx" href={fileName}>Download</a> */}

                    <input
                      type="file"
                      ref={myRef}
                      className="border-0 px-3 py-3 placeholder-blueGray-300 text-blueGray-600 bg-white rounded text-sm shadow focus:outline-none focus:ring w-full ease-linear transition-all duration-150"
                      defaultValue=""
                      style={{ display: "none" }}
                      onChange={async () => {
                        // console.log(await myRef.current?.files?.[0].arrayBuffer());
                        console.log("myRef.current?.files?.[0].", myRef.current?.files?.[0]);

                        const _fileBuffer: ArrayBuffer | undefined = await myRef.current?.files?.[0].arrayBuffer()
                        console.log("1");

                        let file = myRef.current?.files?.[0]
                        if (_fileBuffer) {
                          console.log("2");
                          props.setFileBuffer(_fileBuffer)
                        }

                        if (file) {
                          props.setFileName(file?.name)


                          console.log(URL.createObjectURL(file));
                        }

                      }}
                      readOnly
                    />
                  </div>
                </div>
                <div className="w-full lg:w-3/12 px-4">
                  <div className="relative w-full mb-3">
                    <label
                      className="block uppercase text-blueGray-600 text-xs font-bold mb-2"
                      htmlFor="grid-password"
                    >
                    </label>

                    <button className="border-0 px-3 px-2-5 my-4 placeholder-blueGray-300 text-blueGray-600 bg-white rounded border-2 text-sm shadow focus:outline-none focus:ring w-full ease-linear transition-all duration-150"
                      type="button"
                      onClick={() => {
                        myRef.current?.click()
                      }}
                    >

                      <FontAwesomeIcon icon={faUpload} />{" "}
                    </button>
                  </div>
                </div>

              </div>

              <hr className="mt-6 border-b-1 border-blueGray-300" />


              <div className="flex items-center justify-center flex-wrap">
                <div className="w-1/4  lg:w-12/12 px-4">
                  <div className="relative  center mb-3">
                    <button className="border-0 px-3 px-2-5 my-4 placeholder-blueGray-300 text-blueGray-600 bg-white rounded border-2 text-sm shadow focus:outline-none focus:ring w-full ease-linear transition-all duration-150"
                      type="submit">
                      {spinnerProcess && <FontAwesomeIcon icon={faSpinner} className="animate-spin" />} &nbsp;&nbsp;
                      Create Document
                    </button>
                  </div>
                </div>
              </div>

            </form>

          </div>
        </>
        <SetPin setShowModal={setShowModal} showModal={showModal} buttonLable={"Verify Pin"} color="light" setPin={setPin} pin={pin} setCheckPin={setCheckPin} />

      </div >
    </>
  );
}
