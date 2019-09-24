const AWS = require('aws-sdk')

const successfullResponse = {
  statusCode: 200,
  body: 'Request is OK.',
}

const newAWSApiGatewayManagementApi = (event) => {
  const endpoint = process.env.IS_OFFLINE
    ? 'http://localhost:3005'
    : `${event.requestContext.domainName}/${event.requestContext.stage}`
  const apiVersion = '2018-11-29'

  return new AWS.ApiGatewayManagementApi({ apiVersion, endpoint })
}

const sendToClient = (data, connectionId, apigwManagementApi) => {
  // console.log(`sendToClient:${connectionId}`)
  let sendee = data
  if (typeof data === 'object') sendee = JSON.stringify(data)

  return apigwManagementApi
    .postToConnection({ ConnectionId: connectionId, Data: sendee })
    .promise()
}

module.exports.echo = async (event, context) => {
  const action = JSON.parse(event.body)

  await sendToClient(action.message, event.requestContext.connectionId, newAWSApiGatewayManagementApi(event, context)) // eslint-disable-line 

  return successfullResponse
}
