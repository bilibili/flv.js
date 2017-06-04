/**
 * utf8 解码
 * 
 * @param {Array} bytes 字节集
 * @return {string} 返回解码后的字符串
 * @example decodeUTF8():base
  ```js
  var bytes = [72, 101, 108, 108, 111, 32, 87, 114, 111, 108, 100, 33, 32, 228, 189, 160, 229, 165, 189, 228, 184, 150, 231, 149, 140, 239, 188, 129]
  console.log(decodeUTF8(bytes));
  // > Hello Wrold! 你好世界！
  ```
 */
function decodeUTF8(bytes) {
	return decodeURIComponent(escape(String.fromCharCode.apply(String, bytes)));
}

export default decodeUTF8;
