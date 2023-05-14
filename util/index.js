const fs = require("fs");
const path = require("path");

const inquirer = require("inquirer");
const axios = require("axios").default;
// const url = require("node:url")

const TurndownService = require("./conversion");
const { gfm } = require("./plugin");

const download = require("download");
const { resolve } = require("path");
const { rejects } = require("assert");

// 请求文档
async function getDocument(url) {
  const response = await axios.request({
    url: url,
    method: "get",
    headers: {
      token: JSON.parse(getConfig()).token,
    },
  });
  return response.data.data;
}

async function getLibrary(libraryID) {
  const response = await axios.request({
    url: `https://iknow.hs.net/console-ui/kiplatform-console/library/getLibraryDetail?libraryId=${libraryID}`,
    method: "get",
    headers: {
      token: JSON.parse(getConfig()).token,
    },
  });
  return response.data.data;
}

// 格式转换
const imgMap = new Map();
function html2md(str, docID) {
  const turndownService = new TurndownService({ codeBlockStyle: "fenced" });
  // Use the gfm plugin
  turndownService.use(gfm);
  // 自定义配置
  // turndownService.keep('img')
  // turndownService.clearImgArr();
  const markdown = turndownService.turndown(str);
  return markdown;
}

// 通过请求一个文档的返回结果判断登录状态
async function loginStatus() {
  let res = await getDocument(
    "https://iknow.hs.net/console-ui/kiplatform-console/document/getDocument?documentId=30055"
  );
  if (!(res && res.data && res.data.data)) {
    return false;
  } else {
    return true;
  }
}

// 登录逻辑
async function login() {
  if (!loginStatus()) {
    const { token } = await inquirer.prompt({
      type: "input",
      name: "token",
      message: `登录状态已失效，请输入登录账号的token`,
    });
    const config = JSON.parse(getConfig());
    config.token = token;
    fs.writeFileSync(
      path.resolve(__dirname, "../config.json"),
      JSON.stringify(config, null, 2),
      "utf-8"
    );
    await login();
  } else {
    console.log("当前登录状态有效");
  }
}

// 创建文件输出路径
var directory = "";
async function createDir() {
  const { dir } = await inquirer.prompt({
    type: "input",
    name: "dir",
    message: `请输入存放md的文件路径`,
  });
  try {
    await fs.promises.stat(dir);
    directory = dir;
  } catch (e) {
    await createDir();
  }
}

// 输入类别id,如恒生内部文档 “小程序相关” 对应id为677
// let byLibraryId = ''
async function byLibraryId(libraryID) {
  if (!loginStatus()) {
    await login();
  }
  // 根据输入类别id下载对应数据
  const res = await getLibrary(libraryID);
  if (!res) {
    console.log("请输入正确的libraryID");
    return;
  }
  if (directory === "") {
    await createDir();
  }
  const { catalogueList } = res;
  // 先请求获取全部数据
  const dirName = replaceIllegalChar(res.libraryName);
  storePath = path.resolve(directory, dirName);
  mkdir(storePath);
  await getDocumentsByLibraryIDs(catalogueList, storePath);
  // 下载图片
  await downImgs();
}

// 根据输入类别id批量保存所需全部文档id
async function getDocumentsByLibraryIDs(arr, dirPath) {
  let failedCount = 0;
  let successCount = 0;
  const docIDArr = [];
  const failedArr = [];
  if (!arr) return;
  // 保留文档层次
  // 建立一个映射，（路径，替换非法字符）=> id-文档名（替换非法字符）
  const map = new Map();
  const promiseAll = [];
  let count = 0;
  function recursionDoc(arr, dirPath) {
    for (let i = 0; i < arr.length; i++) {
      //有孩子节点，路径需要加一层
      if (arr[i].children.length > 0) {
        const dirName = replaceIllegalChar(arr[i].name);
        const storePath = path.resolve(dirPath, dirName);
        mkdir(storePath);
        recursionDoc(arr[i].children, storePath);
      } else {
        // 是文档，而不是路径
        count++;
        promiseAll.push(
          byDocId(arr[i].documentId)
            .then((res) => {
              if (!res) {
                count--;
                return;
              }
              ConvertAndStoreData(res, dirPath)
                .then(successCount++)
                .catch(failedCount++, Promise.resolve());
            })
            .catch(
              Promise.resolve((res) => {
                failedCount++;
                failedArr.push(arr[i].documentId);
              })
            )
        );
      }
    }
  }
  recursionDoc(arr, dirPath);
  // console.log(count);
  await Promise.all(promiseAll);
  if (successCount === count) {
    console.log(`全部文档一共${count}条，全部下载和转换成功`);
  } else {
    console.log(
      `全部文档一共有${docIDArr.length}条，下载和转换成功的有${successCount}条，失败的有${failedCount}条，下载失败的文档ID有`,
      failedArr
    );
  }
}

// 根据URL请求文档
async function byUrl(url) {
  if (!loginStatus()) {
    await login();
  }
  if (directory === "") {
    await createDir();
  }
  return await getDocument(url);
}

// 根据ID请求文档
async function byDocId(id) {
  if (!loginStatus()) {
    await login();
  }
  return await getDocument(
    `https://iknow.hs.net/console-ui/kiplatform-console/document/getDocument?documentId=${id}`
  );
}

// 类别名id在用户输入获取
// 将请求后的数据存入到 用户输入路径 + 类别名
let storePath = "";
async function ConvertAndStoreData(result, dirPath) {
  // 拼接路径
  if (!dirPath) {
    dirPath = directory;
  }
  // h2md转换
  let resStr = "";
  // 为md类型
  if (result?.docType === 2) {
    resStr = result.content;
  } else {
    // 为 html类型
    resStr = html2md(result.content, result.id);
  }
  // 正则解析图片并保存
  const reg = /https?:\/\/.*?\.(?:png|jpg)/gi;
  const arr = resStr.match(reg);
  if (arr) imgMap.set(result.id, [...arr]);
  // 命名不规范进行替换
  const resName = replaceIllegalChar(result.name);
  // 有文档同名情况，所以加上id
  fs.writeFileSync(
    path.resolve(dirPath, `./${result.id}-${resName}.md`),
    resStr
  );
}

function replaceIllegalChar(str) {
  return str.trim().replace(/[/\_\*\|\\]/g, "===");
}
async function downImgs() {
  const pArr = [];
  const assetPath = path.resolve(storePath, "./assets");
  mkdir(assetPath);
  // 获取路径
  // 每张图片，只属于一个固定的文章
  let total = 0;
  const failedPicArr = [];
  if (imgMap.length === 0) {
    console.log("没有需要下载的图片");
    return;
  }
  console.log("开始下载图片");
  for (const [id, arr] of imgMap) {
    const result = await byDocId(id);
    const str = `${result.id}-${result.name}`;
    arr.map((url) => {
      total++;
      pArr.push(
        download(url, path.resolve(assetPath, str)).catch((err) => {
          failedPicArr.push(id + "-" + url);
          return Promise.resolve(err);
        })
      );
    });
  }
  await Promise.all(pArr).catch((err) => console.log(err));
  if (failedPicArr.length === 0) {
    console.log("图片全部下载成功");
  } else {
    console.log(`部分图片下载成功，下载失败的图片有${failedPicArr}`);
  }
}

function mkdir(dirpath) {
  if (fs.existsSync(dirpath)) {
    return;
  }
  fs.mkdirSync(dirpath);
}

function getConfig() {
  return (
    fs.readFileSync(path.resolve(__dirname, "../config.json"), "utf-8") || "{}"
  );
}

module.exports = {
  byUrl,
  byDocId,
  login,
  createDir,
  byLibraryId,
  ConvertAndStoreData,
};
