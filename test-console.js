window.postMessage({
    type: 'WEBMCP_EXECUTE_REQUEST',
    payload: {
        jsonrpc: '2.0',
        method: 'query_weather', // 替换为真实的 toolName
        params: { zipcode: '95765' }, // 替换为你的 inputs 配置
        id: 'test-123'
    },
    from: 'WEBMCP-INJECTED'
}, '*');