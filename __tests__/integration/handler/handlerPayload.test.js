'use strict'

const { resolve } = require('path')
const { URL } = require('url')
const fetch = require('node-fetch')
const Serverless = require('serverless')
const ServerlessOffline = require('../../../src/ServerlessOffline.js')

const endpoint = process.env.npm_config_endpoint

jest.setTimeout(30000)

describe('handler payload tests', () => {
  let serverlessOffline

  // init
  beforeAll(async () => {
    if (endpoint) return // if test endpoint is define then don't setup a test endpoint

    const serverless = new Serverless()
    serverless.config.servicePath = resolve(__dirname)
    await serverless.init()
    serverlessOffline = new ServerlessOffline(serverless, {})

    return serverlessOffline.start()
  })

  // cleanup
  afterAll(async () => {
    if (endpoint) return // if test endpoint is define then there's no need for a clean up

    return serverlessOffline.end()
  })

  const url = new URL(endpoint || 'http://localhost:3000')
  const { pathname } = url

  ;[
    {
      description: 'when handler is context.done',
      expected: 'foo',
      path: 'context-done-handler',
    },

    {
      description: 'when handler is context.done which is deferred',
      expected: 'foo',
      path: 'context-done-handler-deferred',
    },

    {
      description: 'when handler is context.succeed',
      expected: 'foo',
      path: 'context-succeed-handler',
    },

    {
      description: 'when handler is context.succeed which is deferred',
      expected: 'foo',
      path: 'context-succeed-handler-deferred',
    },

    {
      description: 'when handler is a callback',
      expected: 'foo',
      path: 'callback-handler',
    },
    {
      description: 'when handler is a callback which is deferred',
      expected: 'foo',
      path: 'callback-handler-deferred',
    },

    {
      description: 'when handler returns a promise',
      expected: 'foo',
      path: 'promise-handler',
    },

    {
      description: 'when handler a promise which is deferred',
      expected: 'foo',
      path: 'promise-handler-deferred',
    },

    {
      description: 'when handler is an async function',
      expected: 'foo',
      path: 'async-function-handler',
    },

    // NOTE: mix and matching of callbacks and promises is not recommended,
    // nonetheless, we test some of the behaviour to match AWS execution precedence
    {
      description:
        'when handler returns a callback but defines a callback parameter',
      expected: 'Hello Promise!',
      path: 'promise-with-defined-callback-handler',
    },

    {
      description:
        'when handler throws an expection in promise should return 502',
      path: 'throw-exception-in-promise-handler',
      status: 502,
    },

    {
      description:
        'when handler throws an expection before calling callback should return 502',
      path: 'throw-exception-in-callback-handler',
      status: 502,
    },

    {
      description:
        'when handler does not return any answer in promise should return 502',
      path: 'no-answer-in-promise-handler',
      status: 502,
    },

    {
      description:
        'when handler returns bad answer in promise should return 200',
      path: 'bad-answer-in-promise-handler',
    },

    {
      description:
        'when handler returns bad answer in callback should return 200',
      path: 'bad-answer-in-callback-handler',
    },

    {
      description:
        'when handler returns on requesting HEAD on an existing HEAD path',
      path: 'head-only-handler',
      method: 'HEAD',
    },

    {
      description:
        'when handler returns on requesting HEAD on an existing HEAD/GET path',
      path: 'head-get-handler',
      method: 'HEAD',
    },

    {
      description:
        'when handler returns on requesting GET on an existing HEAD/GET path',
      path: 'head-get-handler',
    },

    {
      description: 'when requesting HEAD on a GET path should return 403',
      path: 'promise-handler',
      method: 'HEAD',
      status: 403,
    },

    {
      description: 'when requesting GET on a HEAD path should return 403',
      path: 'head-only-handler',
      status: 403,
    },

    // TODO: reactivate!
    // {
    //   description: 'when handler calls context.succeed and context.done',
    //   expected: 'Hello Context.succeed!',
    //   path: 'context-succeed-with-context-done-handler',
    // },

    // TODO: reactivate!
    // {
    //   description: 'when handler calls callback and context.done',
    //   expected: 'Hello Callback!',
    //   path: 'callback-with-context-done-handler',
    // },

    // TODO: reactivate!
    // {
    //   description: 'when handler calls callback and returns Promise',
    //   expected: 'Hello Callback!',
    //   path: 'callback-with-promise-handler',
    // },

    // TODO: reactivate!
    // {
    //   description: 'when handler calls callback inside returned Promise',
    //   expected: 'Hello Callback!',
    //   path: 'callback-inside-promise-handler',
    // },
  ].forEach(({ description, expected, path, method = 'GET', status = 200 }) => {
    test(description, async () => {
      url.pathname = `${pathname}${pathname === '/' ? '' : '/'}${path}`
      const response = await fetch(url, { method })
      expect(response.status).toEqual(status)
      if (expected) {
        const json = await response.json()
        expect(json).toEqual(expected)
      }
    })
  })
})
