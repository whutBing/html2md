### Html2MD

一个基于turndown的可批量将html转为markdown的工具。**主要提供开发思路**。

---

### 开发思路

- 需要具备一定的"抓包能力"，获取html的api接口以及token(个人合法的)
- 网络请求（axios）
- 递归，批量下载的文章，一般都会分门别类，且有层级
- 批量请求（promise.all）
- 文件读写，将请求到的数据（html）进行转换并存入本地；
- node.js开发基础，如文件，命令行交互
- html转换为md主要基于`turndown`并且在插件进行更改





