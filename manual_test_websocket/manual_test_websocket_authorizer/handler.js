'use strict';

const AWS = require('aws-sdk');
const ddb = (()=>{
  if (process.env.IS_OFFLINE) return new AWS.DynamoDB.DocumentClient({region: "localhost", endpoint: "http://localhost:8000"});
  return new AWS.DynamoDB.DocumentClient();
})();

const successfullResponse = {
  statusCode: 200,
  body: 'Request is OK.'
};

const errorResponse = {
  statusCode: 400,
  body: 'Request is not OK.'
};

const generatePolicy = function(principalId, effect, resource) {
  const authResponse = {};
  authResponse.principalId = principalId;
  if (effect && resource) {
      const policyDocument = {};
      policyDocument.Version = '2012-10-17';
      policyDocument.Statement = [];
      const statementOne = {};
      statementOne.Action = 'execute-api:Invoke';
      statementOne.Effect = effect;
      statementOne.Resource = resource;
      policyDocument.Statement[0] = statementOne;
      authResponse.policyDocument = policyDocument;
  }
  return authResponse;
};


module.exports.connect = async (event, context) => {
  // console.log('connect:');
  return successfullResponse; 
};

module.exports.authCB = (event, context, callback) => {
  console.log('auth:');

  console.log(event);
  console.log(context);

  
  const token = event.headers['Auth'];
  
  if ('allow'===token) callback(null, generatePolicy('user', 'Allow', event.methodArn));
  else callback(null, generatePolicy('user', 'Deny', event.methodArn));
};

module.exports.auth = async (event, context) => {
  console.log('auth:');

  console.log(event);
  console.log(context);

  const listener=await ddb.get({TableName:'listeners', Key:{name:'default'}}).promise();
  console.log('listener.Item:');
  console.log(listener.Item);
  if (listener.Item) {
    const timeout=new Promise((resolve) => setTimeout(resolve,100));
    const send=sendToClient( // sendToClient won't return on AWS when client doesn't exits so we set a timeout
      JSON.stringify({action:'update', event:'connect', info:{}}),//{id:event.requestContext.connectionId, event:{...event,  apiGatewayUrl:`${event.apiGatewayUrl}`}, context}}), 
      listener.Item.id, 
      newAWSApiGatewayManagementApi(event, context)).catch(()=>{});
    await Promise.race([send, timeout]);
  }
  
  const token = event.headers['Auth'];
  
  if ('allow'===token) return generatePolicy('user', 'Allow', event.methodArn);
  return generatePolicy('user', 'Deny', event.methodArn);
};

module.exports.echo = async (event, context) => {
  // console.log(event);
  const action = JSON.parse(event.body);
  await sendToClient(action.message, event.requestContext.connectionId, newAWSApiGatewayManagementApi(event, context)).catch(err=>console.log(err));
  return successfullResponse; 
};

module.exports.registerListener = async (event, context) => {
  await ddb.put({TableName:'listenersAuth', Item:{name:'default', id:event.requestContext.connectionId}}).promise();
  await sendToClient({action:'update', event:'register-listener', info:{id:event.requestContext.connectionId}}, event.requestContext.connectionId, newAWSApiGatewayManagementApi(event, context)).catch(err=>console.log(err));
  return successfullResponse; 
};

module.exports.deleteListener = async (event, context) => {
  await ddb.delete({TableName:'listenersAuth', Key:{name:'default'}}).promise();

  return successfullResponse;  
};

const newAWSApiGatewayManagementApi=(event, context)=>{
  let endpoint=event.apiGatewayUrl;

  if (!endpoint) endpoint = event.requestContext.domainName+'/'+event.requestContext.stage;
  const apiVersion='2018-11-29';
  return new AWS.ApiGatewayManagementApi({ apiVersion, endpoint });
};

const sendToClient = (data, connectionId, apigwManagementApi) => {
  console.log(`sendToClient:${connectionId} data=${data}`);
  let sendee=data;
  if ('object'==typeof data) sendee=JSON.stringify(data);

  return apigwManagementApi.postToConnection({ConnectionId: connectionId, Data: sendee}).promise();
};
