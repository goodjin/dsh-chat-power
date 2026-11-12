import { describe, expect, it, vi } from 'vitest'
import { requestChrome } from '../src/browser/chrome-request.ts'
const send = (body: string | null, status = 200) => vi.fn().mockResolvedValue(new Response(body, { status }))
describe('Chrome 书签接口响应', () => {
  it.each([404, 405])('旧宿主返回空 %s 时提示重启，不抛 JSON 解析错误', async status => {
    await expect(requestChrome(undefined, undefined, send(null, status))).rejects.toThrow('接口尚未加载')
  })
  it.each(['', '<html>error</html>', '{"profiles":'])('空响应或非 JSON 响应可理解且可重试', async body => {
    await expect(requestChrome(undefined, undefined, send(body))).rejects.toThrow('请重启 DSH')
  })
  it('保留宿主的文件读取错误，并处理授权失败和格式错误', async () => {
    await expect(requestChrome(undefined, undefined, send('{"error":"无法读取 Chrome 书签"}', 400))).rejects.toThrow('无法读取 Chrome 书签')
    await expect(requestChrome(undefined, undefined, send(null, 401))).rejects.toThrow('未获授权')
    await expect(requestChrome(undefined, undefined, send('{}'))).rejects.toThrow('数据格式不正确')
  })
  it('正常发现、预览，并在失败后重新请求', async () => {
    const fetch = send(null, 405)
    await expect(requestChrome(undefined, undefined, fetch)).rejects.toThrow('接口尚未加载')
    fetch.mockResolvedValueOnce(new Response('{"root":"/chrome","profiles":[{"id":"Default","name":"本机"}]}'))
    expect(await requestChrome(undefined, undefined, fetch)).toEqual({ root: '/chrome', profiles: [{ id: 'Default', name: '本机' }] })
    expect(await requestChrome('/chrome', 'Default', send('{"bookmarks":[]}'))).toEqual({ bookmarks: [] })
  })
})
