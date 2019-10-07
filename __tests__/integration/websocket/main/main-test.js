/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable import/no-unresolved */
/* eslint-disable no-unused-expressions */

import { resolve } from 'path'
import fetch from 'node-fetch'
import { joinUrl, setup, teardown } from '../../_testHelpers/index.js'

const aws4 = require('aws4')
const awscred = require('awscred')
const moment = require('moment')

const endpoint = process.env.npm_config_endpoint || 'ws://localhost:3001'
const loadOfflineServer = !process.env.npm_config_endpoint
const timeout = 30000 // process.env.npm_config_timeout ? parseInt(process.env.npm_config_timeout) : 1000
const WebSocketTester = require('../../_testHelpers/WebSocketTester')

jest.setTimeout(30000)

describe('WebSocket tests', () => {
  let clients = []
  let cred = null
  const createWebSocket = async (options) => {
    const ws = new WebSocketTester()
    let url = endpoint
    let wsOptions = null
    if (options && options.url) url = options.url // eslint-disable-line prefer-destructuring
    if (options && options.qs) url = `${url}?${options.qs}`
    if (options && options.headers) wsOptions = { headers: options.headers }
    const hasOpened = await ws.open(url, wsOptions)
    if (!hasOpened) {
      try { ws.close() } catch (err) {} // eslint-disable-line

      return undefined
    }
    clients.push(ws)

    return ws
  }

  const createClient = async (options) => {
    const ws = await createWebSocket(options)

    ws.send(JSON.stringify({ action: 'getClientInfo' }))

    const json = await ws.receive1()
    const { id } = JSON.parse(json).info

    return { ws, id }
  }
  // init
  beforeAll(async () => {
    cred = await new Promise((res, reject) => {
      awscred.loadCredentials((err, data) => {
        if (err) reject(err)
        else res(data)
      })
    })

    if (!loadOfflineServer) return null
    return setup({
      servicePath: resolve(__dirname),
    })
  })

  // cleanup
  afterAll(() => {
    if (!loadOfflineServer) return null
    return teardown()
  })

  beforeEach(() => {
    clients = []
  })

  afterEach(async () => {
    // const unreceived0 = clients.map(() => 0)
    const unreceived = clients.map(() => 0)
    await Promise.all(
      clients.map(async (ws, i) => {
        const n = ws.countUnrecived()
        unreceived[i] = n

        if (n > 0) {
          console.log(`unreceived:[i=${i}]`)
          ;(await ws.receive(n)).forEach((m) => console.log(m))
        }

        ws.close()
      }),
    )
    // expect(unreceived).to.be.deep.equal(unreceived0)
    clients = []
  })

  const httpUrl = `${endpoint.replace('ws://', 'http://').replace('wss://', 'https://')}` // eslint-disable-line

  test('request to upgrade to WebSocket when receiving an HTTP request', async () => {
    let response = await fetch(joinUrl(httpUrl, `/${Date.now()}`))
    expect(response.status).toEqual(426)

    response = await fetch(joinUrl(httpUrl, `/${Date.now()}/${Date.now()}`))
    expect(response.status).toEqual(426)
  })

  test('open a WebSocket', async () => {
    const ws = await createWebSocket()
    expect(ws).toBeDefined()
  })

  test('should receive client connection info', async () => {
    const ws = await createWebSocket()
    ws.send(JSON.stringify({ action: 'getClientInfo' }))
    const clientInfo = JSON.parse(await ws.receive1())

    expect(clientInfo).toEqual({
      action: 'update',
      event: 'client-info',
      info: { id: clientInfo.info.id },
    })
  })

  test('should call default handler when no such action exists', async () => {
    const ws = await createWebSocket()
    const payload = JSON.stringify({ action: `action${Date.now()}` })
    ws.send(payload)

    expect(await ws.receive1()).toEqual(`Error: No Supported Action in Payload '${payload}'`) // eslint-disable-line
  })

  test('should call default handler when no action provided', async () => {
    const ws = await createWebSocket()
    ws.send(JSON.stringify({ hello: 'world' }))

    expect(await ws.receive1()).toEqual('Error: No Supported Action in Payload \'{"hello":"world"}\'') // eslint-disable-line
  })

  test('should send & receive data', async () => {
    const c1 = await createClient()
    const c2 = await createClient()
    c1.ws.send(
      JSON.stringify({
        action: 'send',
        data: 'Hello World!',
        clients: [c1.id, c2.id],
      }),
    )

    expect(await c1.ws.receive1()).toEqual('Hello World!')
    expect(await c2.ws.receive1()).toEqual('Hello World!')
  })

  test('should respond when having an internal server error', async () => {
    const conn = await createClient()
    conn.ws.send(JSON.stringify({ action: 'makeError' }))
    const res = JSON.parse(await conn.ws.receive1())

    expect(res).toEqual({
      message: 'Internal server error',
      connectionId: conn.id,
      requestId: res.requestId,
    })
  })

  test.skip('should get error when handler does not respond', async () => {
    const conn = await createClient()
    conn.ws.send(JSON.stringify({ action: 'doNotAnswerAsync' }))
    const res = JSON.parse(await conn.ws.receive1())

    expect(res).toEqual({
      message: 'Internal server error',
      connectionId: conn.id,
      requestId: res.requestId,
    })
  })

  test.skip('should not open a connection when connect function returns an error', async () => {
    const ws = await createWebSocket({ qs: 'return=400' })
    expect(ws).toBeUndefined()
  })

  test.skip('should get the error when trying to open WebSocket and connect function returns an error', async () => {
    const response = await fetch(`${httpUrl}?return=400`, {
      headers: {
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'tqDb9pU/uwEchHWtz91LRA==',
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits', // eslint-disable-line
      },
    })

    expect(response.status).toEqual(400)
  })

  test.skip('should not open a connection when connect function throwing an exception', async () => {
    const ws = await createWebSocket({ qs: 'exception=1' })
    expect(ws).toBeUndefined()
  })

  test.skip('should get 502 when trying to open WebSocket and having an exeption in connect function', async () => {
    const response = await fetch(`${httpUrl}?exception=1`, {
      headers: {
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'tqDb9pU/uwEchHWtz91LRA==',
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits', // eslint-disable-line
      },
    })
    expect(response.status).toEqual(502)
  })

  test.skip('should not open a connection when connect function not answer', async () => {
    const ws = await createWebSocket({ qs: 'do-not-answer=1' })
    expect(ws).toBeUndefined()
  })

  test.skip('should get 502 when trying to open WebSocket and connect function not answer', async () => {
    const response = await fetch(`${httpUrl}?do-not-answer=1`, {
      headers: {
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'tqDb9pU/uwEchHWtz91LRA==',
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits', // eslint-disable-line
      },
    })
    expect(response.status).toEqual(502)
  })

  test('should respond via callback', async () => {
    const ws = await createWebSocket()
    ws.send(JSON.stringify({ action: 'replyViaCallback' }))
    const res = JSON.parse(await ws.receive1())
    expect(res).toEqual({ action: 'update', event: 'reply-via-callback' })
  })

  test('should respond with error when calling callback(error)', async () => {
    const conn = await createClient()
    conn.ws.send(JSON.stringify({ action: 'replyErrorViaCallback' }))
    const res = JSON.parse(await conn.ws.receive1())
    expect(res).toEqual({
      message: 'Internal server error',
      connectionId: conn.id,
      requestId: res.requestId,
    })
  })

  test('should respond with only the last action when there are more than one in the serverless.yml file', async () => {
    const ws = await createWebSocket()
    ws.send(JSON.stringify({ action: 'makeMultiCalls' }))
    const res = JSON.parse(await ws.receive1())

    expect(res).toEqual({ action: 'update', event: 'made-call-2' })
  })

  test('should not send to non existing client', async () => {
    const c1 = await createClient()
    c1.ws.send(
      JSON.stringify({
        action: 'send',
        data: 'Hello World!',
        clients: ['non-existing-id'],
      }),
    )

    expect(await c1.ws.receive1()).toEqual('Error: Could not Send all Messages')
  })

  test('should connect & disconnect', async () => {
    const ws = await createWebSocket()
    await ws.send(JSON.stringify({ action: 'registerListener' }))
    await ws.receive1()

    const c1 = await createClient()
    const connect1 = JSON.parse(await ws.receive1())
    delete connect1.info.event
    delete connect1.info.context
    expect(connect1).toEqual({ action:'update', event:'connect', info:{ id:c1.id } }) // eslint-disable-line

    const c2 = await createClient()
    const connect2 = JSON.parse(await ws.receive1())
    delete connect2.info.event
    delete connect2.info.context
    expect(connect2).toEqual({ action:'update', event:'connect', info:{ id:c2.id } }) // eslint-disable-line

    c2.ws.close()
    const disconnect2 = JSON.parse(await ws.receive1())
    delete disconnect2.info.event
    delete disconnect2.info.context
    expect(disconnect2).toEqual({ action:'update', event:'disconnect', info:{ id:c2.id } }) // eslint-disable-line

    const c3 = await createClient()
    const connect3 = JSON.parse(await ws.receive1())
    delete connect3.info.event
    delete delete connect3.info.context
    expect(connect3).toEqual({ action:'update', event:'connect', info:{ id:c3.id } }) // eslint-disable-line

    c1.ws.close()
    const disconnect1 = JSON.parse(await ws.receive1())
    delete disconnect1.info.event
    delete disconnect1.info.context
    expect(disconnect1).toEqual({ action:'update', event:'disconnect', info:{ id:c1.id } }) // eslint-disable-line

    c3.ws.close()
    const disconnect3 = JSON.parse(await ws.receive1())
    delete disconnect3.info.event
    delete disconnect3.info.context
    expect(disconnect3).toEqual({ action:'update', event:'disconnect', info:{ id:c3.id } }) // eslint-disable-line
  })

  const createExpectedEvent = (connectionId, action, eventType, actualEvent) => { // eslint-disable-line
    const url = new URL(endpoint)
    const expected = {
      isBase64Encoded: false,
      requestContext: {
        apiId: actualEvent.requestContext.apiId,
        connectedAt: actualEvent.requestContext.connectedAt,
        connectionId: `${connectionId}`,
        domainName: url.hostname,
        eventType,
        extendedRequestId: actualEvent.requestContext.extendedRequestId,
        identity: {
          accessKey: null,
          accountId: null,
          caller: null,
          cognitoAuthenticationProvider: null,
          cognitoAuthenticationType: null,
          cognitoIdentityId: null,
          cognitoIdentityPoolId: null,
          principalOrgId: null,
          sourceIp: actualEvent.requestContext.identity.sourceIp,
          user: null,
          userAgent: null,
          userArn: null,
        },
        messageDirection: 'IN',
        messageId: actualEvent.requestContext.messageId,
        requestId: actualEvent.requestContext.requestId,
        requestTime: actualEvent.requestContext.requestTime,
        requestTimeEpoch: actualEvent.requestContext.requestTimeEpoch,
        routeKey: action,
        stage: actualEvent.requestContext.stage,
      },
    }

    return expected
  }

  const createExpectedContext = (actualContext) => {
    const expected = {
      awsRequestId: actualContext.awsRequestId,
      callbackWaitsForEmptyEventLoop: true,
      functionName: actualContext.functionName,
      functionVersion: '$LATEST',
      invokedFunctionArn: actualContext.invokedFunctionArn,
      invokeid: actualContext.invokeid,
      logGroupName: actualContext.logGroupName,
      logStreamName: actualContext.logStreamName,
      memoryLimitInMB: actualContext.memoryLimitInMB,
    }

    return expected
  }

  const createExpectedConnectHeaders = (actualHeaders) => {
    const url = new URL(endpoint)
    const expected = {
      Host: `${url.hostname}${url.port ? `:${url.port}` : ''}`,
      'Sec-WebSocket-Extensions': actualHeaders['Sec-WebSocket-Extensions'],
      'Sec-WebSocket-Key': actualHeaders['Sec-WebSocket-Key'],
      'Sec-WebSocket-Version': actualHeaders['Sec-WebSocket-Version'],
      'X-Amzn-Trace-Id': actualHeaders['X-Amzn-Trace-Id'],
      'X-Forwarded-For': actualHeaders['X-Forwarded-For'],
      'X-Forwarded-Port': `${url.port || 443}`,
      'X-Forwarded-Proto': `${url.protocol.replace('ws', 'http').replace('wss', 'https').replace(':', '')}`, // eslint-disable-line
    }

    return expected
  }

  const createExpectedDisconnectHeaders = () => {
    const url = new URL(endpoint)
    const expected = {
      Host: url.hostname,
      'X-Forwarded-For': '',
      'x-api-key': '',
      'x-restapi': '',
    }

    return expected
  }

  const createExpectedConnectMultiValueHeaders = (actualHeaders) => {
    const expected = createExpectedConnectHeaders(actualHeaders)
    Object.keys(expected).forEach((key) => {
      expected[key] = [expected[key]]
    })

    return expected
  }

  const createExpectedDisconnectMultiValueHeaders = (actualHeaders) => {
    const expected = createExpectedDisconnectHeaders(actualHeaders)
    Object.keys(expected).forEach((key) => {
      expected[key] = [expected[key]]
    })

    return expected
  }

  expect.extend({
    toBeWithinRange(received, floor, ceiling) {
      const pass = received >= floor && received <= ceiling
      if (pass) {
        return {
          message: () =>
            `expected ${received} not to be within range ${floor} - ${ceiling}`,
          pass: true,
        }
      }
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      }
    },
  })

  test.skip('should receive correct call info (event only)', async () => {
    const ws = await createWebSocket()
    await ws.send(JSON.stringify({ action: 'registerListener' }))
    await ws.receive1()

    // connect
    const c = await createClient()
    const connect = JSON.parse(await ws.receive1())
    let now = Date.now()
    let expectedCallInfo = {
      id: c.id,
      event: {
        headers: createExpectedConnectHeaders(connect.info.event.headers),
        multiValueHeaders: createExpectedConnectMultiValueHeaders(
          connect.info.event.headers,
        ),
        ...createExpectedEvent(c.id, '$connect', 'CONNECT', connect.info.event),
      },
      context: createExpectedContext(connect.info.context),
    }
    delete connect.info.context
    delete expectedCallInfo.context // Not checking context. Relying on it to be correct because serverless-offline uses general lambda context method
    delete connect.info.event.headers['user-agent']
    delete connect.info.event.multiValueHeaders['user-agent']

    expect(connect).toEqual({ action:'update', event:'connect', info:expectedCallInfo }) // eslint-disable-line
    expect(connect.info.event.requestContext.requestTimeEpoch).toBeWithinRange(connect.info.event.requestContext.connectedAt - 10, connect.info.event.requestContext.requestTimeEpoch + 10) // eslint-disable-line
    expect(connect.info.event.requestContext.connectedAt).toBeWithinRange(now - timeout, now) // eslint-disable-line
    expect(connect.info.event.requestContext.requestTimeEpoch).toBeWithinRange(now - timeout, now) // eslint-disable-line
    expect(moment.utc(connect.info.event.requestContext.requestTime, 'D/MMM/YYYY:H:m:s Z').toDate().getTime()).toBeWithinRange(now - timeout, now) // eslint-disable-line

    if (endpoint.startsWith('ws://locahost')) {
      expect(connect.info.event.headers['X-Forwarded-For']).toEqual('127.0.0.1')
    }

    // getCallInfo
    c.ws.send(JSON.stringify({ action: 'getCallInfo' }))
    const callInfo = JSON.parse(await c.ws.receive1())
    now = Date.now()
    expectedCallInfo = {
      event: {
        body: '{"action":"getCallInfo"}',
        ...createExpectedEvent(
          c.id,
          'getCallInfo',
          'MESSAGE',
          callInfo.info.event,
        ),
      },
      context: createExpectedContext(callInfo.info.context),
    }
    delete callInfo.info.context
    delete expectedCallInfo.context // Not checking context. Relying on it to be correct because serverless-offline uses general lambda context method

    expect(callInfo).toEqual({
      action: 'update',
      event: 'call-info',
      info: expectedCallInfo,
    })
    expect(callInfo.info.event.requestContext.connectedAt).toBeLessThan(callInfo.info.event.requestContext.requestTimeEpoch) // eslint-disable-line
    expect(callInfo.info.event.requestContext.connectedAt).toBeWithinRange(now - timeout, now) // eslint-disable-line
    expect(callInfo.info.event.requestContext.requestTimeEpoch).toBeWithinRange(now - timeout, now) // eslint-disable-line
    expect(moment.utc(callInfo.info.event.requestContext.requestTime, 'D/MMM/YYYY:H:m:s Z').toDate().getTime()).toBeWithinRange(now - timeout, now) // eslint-disable-line

    // disconnect
    c.ws.close()
    const disconnect = JSON.parse(await ws.receive1())
    now = Date.now()
    expectedCallInfo = { id:c.id, event:{ headers:createExpectedDisconnectHeaders(disconnect.info.event.headers), multiValueHeaders:createExpectedDisconnectMultiValueHeaders(disconnect.info.event.headers), ...createExpectedEvent(c.id, '$disconnect', 'DISCONNECT', disconnect.info.event) }, context:createExpectedContext(disconnect.info.context) } // eslint-disable-line
    delete disconnect.info.context
    delete expectedCallInfo.context // Not checking context. Relying on it to be correct because serverless-offline uses general lambda context method
    expect(disconnect).toEqual({
      action: 'update',
      event: 'disconnect',
      info: expectedCallInfo,
    })
  })

  test('should be able to parse query string in connect', async () => {
    const now = `${Date.now()}`
    const ws = await createWebSocket()
    await ws.send(JSON.stringify({ action: 'registerListener' }))
    await ws.receive1()

    await createClient()
    await createClient({ qs: `now=${now}&before=123456789` })

    expect(JSON.parse(await ws.receive1()).info.event.queryStringParameters).toBeUndefined() // eslint-disable-line
    expect(JSON.parse(await ws.receive1()).info.event.queryStringParameters).toEqual({ now, before:'123456789' }) // eslint-disable-line
  })

  test('should be able to get headers in connect', async () => {
    const now = `${Date.now()}`
    const ws = await createWebSocket()
    await ws.send(JSON.stringify({ action: 'registerListener' }))
    await ws.receive1()

    await createClient({ headers: { hello: 'world', now } })
    const { headers } = JSON.parse(await ws.receive1()).info.event

    expect(headers.hello).toEqual('world')
    expect(headers.now).toEqual(now)
  })

  test('should be able to get Authorization header in connect', async () => {
    const ws = await createWebSocket()
    await ws.send(JSON.stringify({ action: 'registerListener' }))
    await ws.receive1()

    await createClient({ url: `${endpoint.replace('wss://', 'wss://david:1234@').replace('ws://', 'ws://david:1234@')}` }) // eslint-disable-line
    const { headers } = JSON.parse(await ws.receive1()).info.event

    expect(headers.Authorization).toEqual('Basic ZGF2aWQ6MTIzNA==')
  })

  const postIt = async (connectionId) => {
    const urlHelper = new URL(httpUrl)
    const signature = {
      service: 'execute-api',
      host: urlHelper.host,
      path: `${urlHelper.pathname}/@connections/${connectionId}`,
      method: 'POST',
      body: 'Hello World!',
      headers: {
        'Content-Type': 'text/plain' /* 'application/text' */,
      },
    }
    aws4.sign(signature, {
      accessKeyId: cred.accessKeyId,
      secretAccessKey: cred.secretAccessKey,
    })
    return fetch(
      joinUrl(httpUrl, signature.path.replace(urlHelper.pathname, '')),
      {
        method: 'POST',
        body: 'Hello World!',
        headers: {
          'X-Amz-Date': signature.headers['X-Amz-Date'],
          Authorization: signature.headers.Authorization,
          'Content-Type': signature.headers['Content-Type'],
        },
      },
    )
  }

  test('should be able to receive messages via REST API', async () => {
    const c = await createClient()

    const response = await postIt(c.id)
    expect(response.status).toEqual(200)
    expect(await c.ws.receive1()).toEqual('Hello World!')
  })

  test('should receive error code when sending to a recently closed client via REST API', async () => {
    const c = await createClient()
    const cId = c.id
    c.ws.close()
    await createWebSocket() // a way to wait for c.ws.close() to actually close

    const response = await postIt(cId)
    expect(response.status).toEqual(410)
  })

  const deleteIt = async (connectionId) => {
    const urlHelper = new URL(httpUrl)
    const signature = {
      service: 'execute-api',
      host: urlHelper.host,
      path: `${urlHelper.pathname}/@connections/${connectionId}`,
      method: 'DELETE',
    }
    aws4.sign(signature, {
      accessKeyId: cred.accessKeyId,
      secretAccessKey: cred.secretAccessKey,
    })

    return fetch(
      joinUrl(httpUrl, signature.path.replace(urlHelper.pathname, '')),
      {
        method: 'DELETE',
        headers: {
          'X-Amz-Date': signature.headers['X-Amz-Date'],
          Authorization: signature.headers.Authorization,
        },
      },
    )
  }

  test('should be able to close connections via REST API', async () => {
    const c = await createClient()
    const cId = c.id

    let response = await deleteIt(cId)
    expect(response.status).toEqual(204)

    response = await deleteIt(cId)
    expect(response.status).toEqual(410)
  })

  test('should receive error code when deleting a previously closed client via REST API', async () => {
    const c = await createClient()
    const cId = c.id
    c.ws.close()
    await createWebSocket() // a way to wait for c.ws.close() to actually close

    const response = await deleteIt(cId)
    expect(response.status).toEqual(410)
  })
})