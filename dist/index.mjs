// src/services/authorization.ts
import { createClient } from "soap";
async function documentAuthorization(accesKey, authorizationUrl) {
  let params = { claveAccesoComprobante: accesKey };
  let authorizationResponse;
  const authorizationRequest = new Promise((resolve, reject) => {
    createClient(authorizationUrl, (err, client) => {
      client.autorizacionComprobante(params, (err2, result) => {
        if (err2) {
          reject(err2);
          return;
        }
        resolve(result);
      });
    });
  });
  authorizationResponse = await authorizationRequest;
  return authorizationResponse;
}

// src/services/generateInvoice.ts
import { create } from "xmlbuilder2";

// src/utils/utils.ts
function generateAccessKey(accessKeyData) {
  let accessKey = "";
  accessKey += formatDateToDDMMYYYY(accessKeyData.date);
  accessKey += accessKeyData.codDoc;
  accessKey += accessKeyData.ruc;
  accessKey += accessKeyData.environment;
  accessKey += accessKeyData.establishment;
  accessKey += accessKeyData.emissionPoint;
  accessKey += accessKeyData.sequential;
  accessKey += generateRandomEightDigitNumber();
  accessKey += "1";
  accessKey += generateVerificatorDigit(accessKey);
  return accessKey;
}
function formatDateToDDMMYYYY(date) {
  return date.replaceAll("/", "");
}
function generateRandomEightDigitNumber() {
  const min = 1e7;
  const max = 99999999;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function generateVerificatorDigit(accessKey) {
  let result = 0;
  let addition = 0;
  let multiple = 7;
  for (let i = 0; i < accessKey.length; i++) {
    addition += parseInt(accessKey.charAt(i)) * multiple;
    multiple > 2 ? multiple-- : multiple = 7;
  }
  result = 11 - addition % 11;
  result === 10 ? result = 1 : result = result;
  result === 11 ? result = 0 : result = result;
  return result;
}

// src/services/generateInvoice.ts
function generateInvoiceXml(invoice) {
  const document = create({ version: "1.0", encoding: "UTF-8" }, invoice);
  const xml = document.end({ prettyPrint: true });
  return xml;
}
function generateInvoice(invoiceData) {
  const accessKey = generateAccessKey({
    date: invoiceData.infoFactura.fechaEmision,
    codDoc: invoiceData.infoTributaria.codDoc,
    ruc: invoiceData.infoTributaria.ruc,
    environment: invoiceData.infoTributaria.ambiente,
    establishment: invoiceData.infoTributaria.estab,
    emissionPoint: invoiceData.infoTributaria.ptoEmi,
    sequential: invoiceData.infoTributaria.secuencial
  });
  const invoice = {
    factura: {
      "@xmlns:ds": "http://www.w3.org/2000/09/xmldsig#",
      "@xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
      "@id": "comprobante",
      "@version": "1.0.0",
      infoTributaria: { ...invoiceData.infoTributaria, claveAcceso: accessKey },
      infoFactura: invoiceData.infoFactura,
      detalles: invoiceData.detalles
    }
  };
  return { invoice, accessKey };
}

// src/services/reception.ts
import { createClient as createClient2 } from "soap";
async function documentReception(stringXML, receptionUrl) {
  const base64XML = Buffer.from(stringXML).toString("base64");
  let params = { xml: base64XML };
  let receptionResult;
  const receptionRequest = new Promise((resolve, reject) => {
    createClient2(receptionUrl, (err, client) => {
      if (err) {
        reject(err);
        return;
      }
      client.validarComprobante(params, (err2, result) => {
        if (err2) {
          reject(err2);
          return;
        }
        resolve(result);
      });
    });
  });
  receptionResult = await receptionRequest;
  return receptionResult;
}

// src/services/signing.ts
import { readFileSync } from "fs";
import * as forge from "node-forge";
function getP12FromLocalFile(path) {
  const file = readFileSync(path);
  const buffer = file.buffer.slice(
    file.byteOffset,
    file.byteOffset + file.byteLength
  );
  return buffer;
}
async function getP12FromUrl(url) {
  const file = await fetch(url).then((response) => response.arrayBuffer()).then((data) => data);
  return file;
}
function getXMLFromLocalFile(path) {
  const file = readFileSync(path, "utf8");
  return file;
}
async function getXMLFromLocalUrl(url) {
  const file = await fetch(url).then((response) => response.text()).then((data) => data);
  return file;
}
function sha1Base64(text, encoding = "utf8") {
  let md2 = forge.md.sha1.create();
  md2.update(text, encoding);
  const hash = md2.digest().toHex();
  const buffer = Buffer.from(hash, "hex");
  const base64 = buffer.toString("base64");
  return base64;
}
function hexToBase64(hex) {
  hex = hex.padStart(hex.length + hex.length % 2, "0");
  const bytes = hex.match(/.{2}/g).map((byte) => parseInt(byte, 16));
  return btoa(String.fromCharCode(...bytes));
}
function bigIntToBase64(bigInt) {
  const hex = bigInt.toString(16);
  const hexPairs = hex.match(/\w{2}/g);
  const bytes = hexPairs.map((pair) => parseInt(pair, 16));
  const byteString = String.fromCharCode(...bytes);
  const base64 = btoa(byteString);
  const formatedBase64 = base64.match(/.{1,76}/g).join("\n");
  return formatedBase64;
}
function getRandomNumber(min = 990, max = 9999) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}
async function signXml(p12Data, p12Password, xmlData) {
  const arrayBuffer = p12Data;
  let xml = xmlData;
  xml = xml.replace(/\s+/g, " ");
  xml = xml.trim();
  xml = xml.replace(/(?<=\>)(\r?\n)|(\r?\n)(?=\<\/)/g, "");
  xml = xml.trim();
  xml = xml.replace(/(?<=\>)(\s*)/g, "");
  const arrayUint8 = new Uint8Array(arrayBuffer);
  const base64 = forge.util.binary.base64.encode(arrayUint8);
  const der = forge.util.decode64(base64);
  const asn12 = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn12, p12Password);
  const pkcs8Bags = p12.getBags({
    bagType: forge.pki.oids.pkcs8ShroudedKeyBag
  });
  const certBags = p12.getBags({
    bagType: forge.pki.oids.certBag
  });
  const certBag = certBags[forge.oids.certBag];
  const friendlyName = certBag[1].attributes.friendlyName[0];
  let certificate;
  let pkcs8;
  let issuerName = "";
  const cert = certBag.reduce((prev, curr) => {
    const attributes = curr.cert.extensions;
    return attributes.length > prev.cert.extensions.length ? curr : prev;
  });
  const issueAttributes = cert.cert.issuer.attributes;
  issuerName = issueAttributes.reverse().map((attribute) => {
    return `${attribute.shortName}=${attribute.value}`;
  }).join(",");
  if (/BANCO CENTRAL/i.test(friendlyName)) {
    let keys = pkcs8Bags[forge.oids.pkcs8ShroudedKeyBag];
    for (let i = 0; i < keys.length; i++) {
      const element = keys[i];
      let name = element.attributes.friendlyName[0];
      if (/Signing Key/i.test(name)) {
        pkcs8 = pkcs8Bags[forge.oids.pkcs8ShroudedKeyBag[i]];
      }
    }
  }
  if (/SECURITY DATA/i.test(friendlyName)) {
    pkcs8 = pkcs8Bags[forge.oids.pkcs8ShroudedKeyBag][0];
  }
  certificate = cert.cert;
  const notBefore = certificate.validity["notBefore"];
  const notAfter = certificate.validity["notAfter"];
  const date = /* @__PURE__ */ new Date();
  if (date < notBefore || date > notAfter) {
    throw new Error("Expired certificate");
  }
  const key = pkcs8.key ?? pkcs8.asn1;
  const certificateX509_pem = forge.pki.certificateToPem(certificate);
  let certificateX509 = certificateX509_pem;
  certificateX509 = certificateX509.substr(certificateX509.indexOf("\n"));
  certificateX509 = certificateX509.substr(
    0,
    certificateX509.indexOf("\n-----END CERTIFICATE-----")
  );
  certificateX509 = certificateX509.replace(/\r?\n|\r/g, "").replace(/([^\0]{76})/g, "$1\n");
  const certificateX509_asn1 = forge.pki.certificateToAsn1(certificate);
  const certificateX509_der = forge.asn1.toDer(certificateX509_asn1).getBytes();
  const hash_certificateX509_der = sha1Base64(certificateX509_der, "utf8");
  const certificateX509_serialNumber = parseInt(certificate.serialNumber, 16);
  const exponent = hexToBase64(key.e.data[0].toString(16));
  const modulus = bigIntToBase64(key.n);
  xml = xml.replace(/\t|\r/g, "");
  const sha1_xml = sha1Base64(
    xml.replace('<?xml version="1.0" encoding="UTF-8"?>', ""),
    "utf8"
  );
  const nameSpaces = 'xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:etsi="http://uri.etsi.org/01903/v1.3.2#"';
  const certificateNumber = getRandomNumber();
  const signatureNumber = getRandomNumber();
  const signedPropertiesNumber = getRandomNumber();
  const signedInfoNumber = getRandomNumber();
  const signedPropertiesIdNumber = getRandomNumber();
  const referenceIdNumber = getRandomNumber();
  const signatureValueNumber = getRandomNumber();
  const objectNumber = getRandomNumber();
  const isoDateTime = date.toISOString().slice(0, 19);
  let signedProperties = "";
  signedProperties += '<etsi:SignedProperties Id="Signature' + signatureNumber + "-SignedProperties" + signedPropertiesNumber + '">';
  signedProperties += "<etsi:SignedSignatureProperties>";
  signedProperties += "<etsi:SigningTime>";
  signedProperties += isoDateTime;
  signedProperties += "</etsi:SigningTime>";
  signedProperties += "<etsi:SigningCertificate>";
  signedProperties += "<etsi:Cert>";
  signedProperties += "<etsi:CertDigest>";
  signedProperties += '<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1">';
  signedProperties += "</ds:DigestMethod>";
  signedProperties += "<ds:DigestValue>";
  signedProperties += hash_certificateX509_der;
  signedProperties += "</ds:DigestValue>";
  signedProperties += "</etsi:CertDigest>";
  signedProperties += "<etsi:IssuerSerial>";
  signedProperties += "<ds:X509IssuerName>";
  signedProperties += issuerName;
  signedProperties += "</ds:X509IssuerName>";
  signedProperties += "<ds:X509SerialNumber>";
  signedProperties += certificateX509_serialNumber;
  signedProperties += "</ds:X509SerialNumber>";
  signedProperties += "</etsi:IssuerSerial>";
  signedProperties += "</etsi:Cert>";
  signedProperties += "</etsi:SigningCertificate>";
  signedProperties += "</etsi:SignedSignatureProperties>";
  signedProperties += "<etsi:SignedDataObjectProperties>";
  signedProperties += '<etsi:DataObjectFormat ObjectReference="#Reference-ID-' + referenceIdNumber + '">';
  signedProperties += "<etsi:Description>";
  signedProperties += "contenido comprobante";
  signedProperties += "</etsi:Description>";
  signedProperties += "<etsi:MimeType>";
  signedProperties += "text/xml";
  signedProperties += "</etsi:MimeType>";
  signedProperties += "</etsi:DataObjectFormat>";
  signedProperties += "</etsi:SignedDataObjectProperties>";
  signedProperties += "</etsi:SignedProperties>";
  const sha1SignedProperties = sha1Base64(
    signedProperties.replace(
      "<ets:SignedProperties",
      "<etsi:SignedProperties " + nameSpaces
    ),
    "utf8"
  );
  let keyInfo = "";
  keyInfo += '<ds:KeyInfo Id="Certificate' + certificateNumber + '">';
  keyInfo += "\n<ds:X509Data>";
  keyInfo += "\n<ds:X509Certificate>\n";
  keyInfo += certificateX509;
  keyInfo += "\n</ds:X509Certificate>";
  keyInfo += "\n</ds:X509Data>";
  keyInfo += "\n<ds:KeyValue>";
  keyInfo += "\n<ds:RSAKeyValue>";
  keyInfo += "\n<ds:Modulus>\n";
  keyInfo += modulus;
  keyInfo += "\n</ds:Modulus>";
  keyInfo += "\n<ds:Exponent>\n";
  keyInfo += exponent;
  keyInfo += "\n</ds:Exponent>";
  keyInfo += "\n</ds:RSAKeyValue>";
  keyInfo += "\n</ds:KeyValue>";
  keyInfo += "\n</ds:KeyInfo>";
  const sha1KeyInfo = sha1Base64(
    keyInfo.replace("<ds:KeyInfo", "<ds:KeyInfo " + nameSpaces),
    "utf8"
  );
  let signedInfo = "";
  signedInfo += '<ds:SignedInfo Id="Signature-SignedInfo' + signedInfoNumber + '">';
  signedInfo += '\n<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315">';
  signedInfo += "</ds:CanonicalizationMethod>";
  signedInfo += '\n<ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1">';
  signedInfo += "</ds:SignatureMethod>";
  signedInfo += '\n<ds:Reference Id="SignedPropertiesID' + signedPropertiesIdNumber + '" Type="http://uri.etsi.org/01903#SignedProperties" URI="#Signature' + signatureNumber + "-SignedProperties" + signedPropertiesNumber + '">';
  signedInfo += '\n<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1">';
  signedInfo += "</ds:DigestMethod>";
  signedInfo += "\n<ds:DigestValue>";
  signedInfo += sha1SignedProperties;
  signedInfo += "</ds:DigestValue>";
  signedInfo += "\n</ds:Reference>";
  signedInfo += '\n<ds:Reference URI="#Certificate' + certificateNumber + '">';
  signedInfo += '\n<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1">';
  signedInfo += "</ds:DigestMethod>";
  signedInfo += "\n<ds:DigestValue>";
  signedInfo += sha1KeyInfo;
  signedInfo += "</ds:DigestValue>";
  signedInfo += "\n</ds:Reference>";
  signedInfo += '\n<ds:Reference Id="Reference-ID-' + referenceIdNumber + '" URI="#comprobante">';
  signedInfo += "\n<ds:Transforms>";
  signedInfo += '\n<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature">';
  signedInfo += "</ds:Transform>";
  signedInfo += "\n</ds:Transforms>";
  signedInfo += '\n<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1">';
  signedInfo += "</ds:DigestMethod>";
  signedInfo += "\n<ds:DigestValue>";
  signedInfo += sha1_xml;
  signedInfo += "</ds:DigestValue>";
  signedInfo += "\n</ds:Reference>";
  signedInfo += "\n</ds:SignedInfo>";
  const canonicalizedSignedInfo = signedInfo.replace(
    "<ds:SignedInfo",
    "<ds:SignedInfo " + nameSpaces
  );
  const md2 = forge.md.sha1.create();
  md2.update(canonicalizedSignedInfo, "utf8");
  const signature = btoa(
    key.sign(md2).match(/.{1,76}/g).join("\n")
  );
  let xadesBes = "";
  xadesBes += "<ds:Signature " + nameSpaces + ' Id="Signature' + signatureNumber + '">';
  xadesBes += "\n" + signedInfo;
  xadesBes += '\n<ds:SignatureValue Id="SignatureValue' + signatureValueNumber + '">\n';
  xadesBes += signature;
  xadesBes += "\n</ds:SignatureValue>";
  xadesBes += "\n" + keyInfo;
  xadesBes += '\n<ds:Object Id="Signature' + signatureNumber + "-Object" + objectNumber + '">';
  xadesBes += '<etsi:QualifyingProperties Target="#Signature' + signatureNumber + '">';
  xadesBes += signedProperties;
  xadesBes += "</etsi:QualifyingProperties>";
  xadesBes += "</ds:Object>";
  xadesBes += "</ds:Signature>";
  return xml.replace(/(<[^<]+)$/, xadesBes + "$1");
}
export {
  documentAuthorization,
  documentReception,
  generateInvoice,
  generateInvoiceXml,
  getP12FromLocalFile,
  getP12FromUrl,
  getXMLFromLocalFile,
  getXMLFromLocalUrl,
  signXml
};
//# sourceMappingURL=index.mjs.map