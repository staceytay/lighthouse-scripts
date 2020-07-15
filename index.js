const { format } = require("date-fns");
const fs = require("fs");
const lighthouse = require("lighthouse");
const chromeLauncher = require("chrome-launcher");

const NUM_RUNS = 5;
const REPORT_DIR = `${__dirname}/reports`;
const URL_HOME = "https://sg.carousell.com";
const URL_LISTING = "https://sg.carousell.com/p/iphone-7-128gb-249127864/";
const URL_LISTS_TO_BLOCK = [
  [],
  ["www.googletagmanager.com/*"],
  ["securepubads.g.doubleclick.net/*"],
  ["https://cdn.branch.io/branch-latest.min.js"],
  ["connect.facebook.net/*"],
];

// Adapted from https://stackoverflow.com/a/45309555.
function getMedianReport(runnerResults) {
  if (runnerResults.length === 0) {
    return 0;
  }

  const sorted = [...runnerResults].sort(function(a, b) {
    return (
      a.lhr.categories.performance.score - b.lhr.categories.performance.score
    );
  });

  const half = Math.floor(sorted.length / 2);

  if (sorted.length % 2) {
    return sorted[half];
  }

  return (sorted[half - 1] + sorted[half]) / 2.0;
}

async function runLighthouseTest(url, lighthouseFlags) {
  const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless"] });
  const runnerResult = await lighthouse(url, {
    output: "html",
    onlyCategories: ["performance"],
    ...lighthouseFlags,
    port: chrome.port,
  });

  const reportHtml = runnerResult.report;
  const fileName = `${new URL(url).host}-${format(
    new Date(),
    "yyyy-MM-dd'T'HHmmss+8",
  )}.html`;
  fs.writeFileSync(`${REPORT_DIR}/${fileName}`, reportHtml);

  await chrome.kill();

  return { ...runnerResult, fileName };
}

async function runLighthouseTestRepeated(url, lighthouseFlags, numRuns) {
  const results = [];
  for (let i = 0; i < numRuns; i++) {
    const result = await runLighthouseTest(url, lighthouseFlags);
    results.push(result);
  }
  return results;
}

function summarizeReport(lhr) {
  return {
    perfScore: lhr.categories.performance.score * 100,
    cls: lhr.audits["cumulative-layout-shift"].displayValue,
    lcp: lhr.audits["largest-contentful-paint"].displayValue,
    tbt: lhr.audits["total-blocking-time"].displayValue,
    tti: lhr.audits["interactive"].displayValue,
  };
}

(async () => {
  const header = [
    "Blocked URL",
    "Device",
    "Overall Score",
    "CLS",
    "LCP",
    "TBT",
    "TTI",
    "Report Filename",
  ];
  console.log(header.join("\t"));
  for (let device of ["desktop", "mobile"]) {
    for (let urlList of URL_LISTS_TO_BLOCK) {
      const results = await runLighthouseTestRepeated(
        URL_HOME,
        {
          blockedUrlPatterns: urlList,
          emulatedFormFactor: device,
        },
        NUM_RUNS,
      );
      const medianReport = getMedianReport(results);
      const { perfScore, cls, lcp, tbt, tti } = summarizeReport(
        medianReport.lhr,
      );
      const row = [
        urlList.length === 0 ? "None" : urlList,
        device,
        perfScore,
        cls,
        lcp,
        tbt,
        tti,
        medianReport.fileName,
      ];
      console.log(row.join("\t"));
    }
  }
})();
