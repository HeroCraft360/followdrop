import { useEffect, useState } from "react";
import JSZip from "jszip";
import "./App.css";

const STORAGE_KEY = "followdrop_snapshots";

function isLikelyInstagramUsername(value) {
  const username = String(value).trim().replace("@", "");
  return /^[A-Za-z0-9._]{1,30}$/.test(username);
}

function isLikelyXUsername(value) {
  const username = String(value).trim().replace("@", "");
  return /^[A-Za-z0-9_]{1,15}$/.test(username);
}

function cleanUsernames(usernames) {
  return [
    ...new Set(
      usernames
        .map((name) => String(name).trim().replace("@", ""))
        .filter(Boolean)
        .filter(isLikelyInstagramUsername)
    ),
  ];
}

function cleanXUsernames(usernames) {
  return [
    ...new Set(
      usernames
        .map((name) => String(name).trim().replace("@", ""))
        .filter(Boolean)
        .filter(isLikelyXUsername)
    ),
  ];
}

function extractUsernamesFromHTML(htmlText) {
  const usernames = [];
  const decodedHTML = htmlText
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");

  const instagramLinkMatches = decodedHTML.matchAll(
    /https?:\/\/(?:www\.)?instagram\.com\/(?:_u\/)?([A-Za-z0-9._]{1,30})(?=[/?#"' <])/g
  );

  for (const match of instagramLinkMatches) {
    const username = match[1];

    const ignoredValues = new Set([
      "_u",
      "p",
      "reel",
      "reels",
      "explore",
      "accounts",
      "direct",
    ]);

    if (!ignoredValues.has(username.toLowerCase())) {
      usernames.push(username);
    }
  }

  if (usernames.length > 0) {
    return cleanUsernames(usernames);
  }

  const withoutTags = decodedHTML.replace(/<[^>]*>/g, " ");
  return cleanUsernames(withoutTags.split(/\r?\n|,|\s+/));
}

function findUsernames(data) {
  const usernames = [];

  function walk(value) {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (value && typeof value === "object") {
      if (Array.isArray(value.string_list_data)) {
        value.string_list_data.forEach((item) => {
          if (typeof item.value === "string") {
            usernames.push(item.value);
          }
        });
      }

      if (typeof value.username === "string") {
        usernames.push(value.username);
      }

      if (
        typeof value.value === "string" &&
        isLikelyInstagramUsername(value.value)
      ) {
        usernames.push(value.value);
      }

      Object.values(value).forEach(walk);
      return;
    }

    if (typeof value === "string" && isLikelyInstagramUsername(value)) {
      usernames.push(value);
    }
  }

  walk(data);
  return cleanUsernames(usernames);
}

function extractUsernamesFromText(text, fileName = "") {
  const lowerFileName = fileName.toLowerCase();
  const trimmedText = text.trim().toLowerCase();

  if (
    lowerFileName.endsWith(".html") ||
    trimmedText.startsWith("<html") ||
    trimmedText.includes("<!doctype html")
  ) {
    return extractUsernamesFromHTML(text);
  }

  try {
    const parsed = JSON.parse(text);
    return findUsernames(parsed);
  } catch {
    return cleanUsernames(text.split(/\r?\n|,|\s+/));
  }
}

function getZipEntryType(path) {
  const lowerPath = path.toLowerCase();
  const fileName = lowerPath.split("/").pop() || "";

  const isSupported =
    fileName.endsWith(".json") ||
    fileName.endsWith(".html") ||
    fileName.endsWith(".txt") ||
    fileName.endsWith(".csv");

  if (!isSupported) return "ignore";

  const ignoredTerms = [
    "recently_unfollowed",
    "blocked",
    "pending_follow_requests",
    "recent_follow_requests",
    "group_stories",
    "close_friends",
    "synced_contacts",
    "contacts",
    "removed_suggestions",
    "follow_requests",
  ];

  if (ignoredTerms.some((term) => lowerPath.includes(term))) {
    return "ignore";
  }

  if (
    lowerPath.includes("followers_and_following") &&
    fileName.startsWith("followers")
  ) {
    return "followers";
  }

  if (
    lowerPath.includes("followers_and_following") &&
    fileName === "following.html"
  ) {
    return "following";
  }

  if (
    lowerPath.includes("followers_and_following") &&
    fileName === "following.json"
  ) {
    return "following";
  }

  if (fileName.startsWith("followers")) {
    return "followers";
  }

  if (fileName.startsWith("following")) {
    return "following";
  }

  return "unknown";
}

async function extractInstagramDataFromZip(file, onProgress) {
  const zip = await JSZip.loadAsync(file);

  const allFiles = Object.values(zip.files).filter((entry) => !entry.dir);

  const entries = allFiles
    .map((entry) => ({
      entry,
      type: getZipEntryType(entry.name),
    }))
    .filter((item) => item.type !== "ignore");

  const usableEntries = entries.filter(
    (item) => item.type === "followers" || item.type === "following"
  );

  if (usableEntries.length === 0) {
    return {
      followers: [],
      following: [],
      filesUsed: [],
      ignoredCount: allFiles.length,
      message:
        "No followers or following files were found. Try uploading an Instagram export ZIP that contains followers_1.html and following.html.",
    };
  }

  const followers = [];
  const following = [];
  const filesUsed = [];

  for (let index = 0; index < usableEntries.length; index++) {
    const { entry, type } = usableEntries[index];

    onProgress({
      percent: Math.round(((index + 1) / usableEntries.length) * 100),
      label: `Scanning ${entry.name}`,
    });

    try {
      const text = await entry.async("text");
      const extracted = extractUsernamesFromText(text, entry.name);

      if (type === "followers") {
        followers.push(...extracted);
      }

      if (type === "following") {
        following.push(...extracted);
      }

      if (extracted.length > 0) {
        filesUsed.push(entry.name);
      }
    } catch {
      continue;
    }
  }

  return {
    followers: cleanUsernames(followers),
    following: cleanUsernames(following),
    filesUsed,
    ignoredCount: allFiles.length - usableEntries.length,
    message: "",
  };
}

function parseXArchiveJS(text) {
  const firstBracketIndex = text.indexOf("[");
  const lastBracketIndex = text.lastIndexOf("]");

  if (firstBracketIndex === -1 || lastBracketIndex === -1) {
    throw new Error("No array found in X archive JS file.");
  }

  const jsonText = text.slice(firstBracketIndex, lastBracketIndex + 1);
  return JSON.parse(jsonText);
}

function extractXUsernamesFromText(text) {
  const usernames = [];

  try {
    const parsed = parseXArchiveJS(text);
    usernames.push(...findXUsernames(parsed));
  } catch {
    const screenNameMatches = text.matchAll(/"screenName"\s*:\s*"([^"]+)"/g);
    for (const match of screenNameMatches) {
      usernames.push(match[1]);
    }

    const linkMatches = text.matchAll(
      /https?:\/\/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})/g
    );

    for (const match of linkMatches) {
      usernames.push(match[1]);
    }
  }

  return cleanXUsernames(usernames);
}

function findXUsernames(data) {
  const usernames = [];

  function walk(value) {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (value && typeof value === "object") {
      if (typeof value.screenName === "string") {
        usernames.push(value.screenName);
      }

      if (typeof value.username === "string") {
        usernames.push(value.username);
      }

      if (typeof value.handle === "string") {
        usernames.push(value.handle);
      }

      if (typeof value.userLink === "string") {
        const match = value.userLink.match(
          /https?:\/\/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})/
        );

        if (match) {
          usernames.push(match[1]);
        }
      }

      Object.values(value).forEach(walk);
    }
  }

  walk(data);
  return cleanXUsernames(usernames);
}

function getXZipEntryType(path) {
  const lowerPath = path.toLowerCase();
  const fileName = lowerPath.split("/").pop() || "";

  if (!fileName.endsWith(".js") && !fileName.endsWith(".json")) {
    return "ignore";
  }

  const ignoredTerms = [
    "blocked",
    "muted",
    "contacts",
    "addressbook",
    "verified",
    "ad",
    "personalization",
    "direct-message",
    "like",
    "tweet",
  ];

  if (ignoredTerms.some((term) => lowerPath.includes(term))) {
    return "ignore";
  }

  if (
    fileName === "follower.js" ||
    fileName.startsWith("follower-part") ||
    fileName.includes("follower")
  ) {
    return "followers";
  }

  if (
    fileName === "following.js" ||
    fileName.startsWith("following-part") ||
    fileName.includes("following")
  ) {
    return "following";
  }

  return "ignore";
}

async function extractXDataFromZip(file, onProgress) {
  const zip = await JSZip.loadAsync(file);
  const allFiles = Object.values(zip.files).filter((entry) => !entry.dir);

  const usableEntries = allFiles
    .map((entry) => ({
      entry,
      type: getXZipEntryType(entry.name),
    }))
    .filter((item) => item.type === "followers" || item.type === "following");

  if (usableEntries.length === 0) {
    return {
      followers: [],
      following: [],
      filesUsed: [],
      ignoredCount: allFiles.length,
      message:
        "No X follower.js or following.js files were found. Try uploading your full X/Twitter archive ZIP.",
    };
  }

  const followers = [];
  const following = [];
  const filesUsed = [];

  for (let index = 0; index < usableEntries.length; index++) {
    const { entry, type } = usableEntries[index];

    onProgress({
      percent: Math.round(((index + 1) / usableEntries.length) * 100),
      label: `Scanning ${entry.name}`,
    });

    try {
      const text = await entry.async("text");
      const extracted = extractXUsernamesFromText(text);

      if (type === "followers") {
        followers.push(...extracted);
      }

      if (type === "following") {
        following.push(...extracted);
      }

      if (extracted.length > 0) {
        filesUsed.push(entry.name);
      }
    } catch {
      continue;
    }
  }

  return {
    followers: cleanXUsernames(followers),
    following: cleanXUsernames(following),
    filesUsed,
    ignoredCount: allFiles.length - usableEntries.length,
    message: "",
  };
}

function compareFollowers(oldFollowers, newFollowers) {
  const oldSet = new Set(oldFollowers.map((name) => name.toLowerCase()));
  const newSet = new Set(newFollowers.map((name) => name.toLowerCase()));

  const unfollowed = oldFollowers.filter(
    (name) => !newSet.has(name.toLowerCase())
  );

  const newFollowersOnly = newFollowers.filter(
    (name) => !oldSet.has(name.toLowerCase())
  );

  return {
    unfollowed: [...new Set(unfollowed)],
    newFollowers: [...new Set(newFollowersOnly)],
  };
}

function getRelationshipInsights(followers, following) {
  const followerSet = new Set(followers.map((name) => name.toLowerCase()));
  const followingSet = new Set(following.map((name) => name.toLowerCase()));

  const notFollowingYouBack = following.filter(
    (name) => !followerSet.has(name.toLowerCase())
  );

  const youDoNotFollowBack = followers.filter(
    (name) => !followingSet.has(name.toLowerCase())
  );

  const mutuals = followers.filter((name) =>
    followingSet.has(name.toLowerCase())
  );

  return {
    notFollowingYouBack: [...new Set(notFollowingYouBack)],
    youDoNotFollowBack: [...new Set(youDoNotFollowBack)],
    mutuals: [...new Set(mutuals)],
  };
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function filterUsernames(usernames, searchQuery) {
  const query = searchQuery.trim().replace("@", "").toLowerCase();

  if (!query) return usernames;

  return usernames.filter((username) => username.toLowerCase().includes(query));
}

function App() {
  const [currentFollowers, setCurrentFollowers] = useState([]);
  const [currentFollowing, setCurrentFollowing] = useState([]);
  const [currentFileName, setCurrentFileName] = useState("");
  const [snapshotName, setSnapshotName] = useState("");
  const [snapshots, setSnapshots] = useState([]);
  const [results, setResults] = useState(null);
  const [relationshipInsights, setRelationshipInsights] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [relationshipSearchQuery, setRelationshipSearchQuery] = useState("");
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingLabel, setProcessingLabel] = useState("");

  const [xFollowers, setXFollowers] = useState([]);
  const [xFollowing, setXFollowing] = useState([]);
  const [xInsights, setXInsights] = useState(null);
  const [xStatusMessage, setXStatusMessage] = useState("");
  const [xSearchQuery, setXSearchQuery] = useState("");
  const [isProcessingXFile, setIsProcessingXFile] = useState(false);
  const [xProcessingProgress, setXProcessingProgress] = useState(0);
  const [xProcessingLabel, setXProcessingLabel] = useState("");

  const filteredUnfollowed = results
    ? filterUsernames(results.unfollowed, searchQuery)
    : [];

  const filteredNewFollowers = results
    ? filterUsernames(results.newFollowers, searchQuery)
    : [];

  const filteredNotFollowingYouBack = relationshipInsights
    ? filterUsernames(
        relationshipInsights.notFollowingYouBack,
        relationshipSearchQuery
      )
    : [];

  const filteredYouDoNotFollowBack = relationshipInsights
    ? filterUsernames(
        relationshipInsights.youDoNotFollowBack,
        relationshipSearchQuery
      )
    : [];

  const filteredMutuals = relationshipInsights
    ? filterUsernames(relationshipInsights.mutuals, relationshipSearchQuery)
    : [];

  const filteredXNotFollowingYouBack = xInsights
    ? filterUsernames(xInsights.notFollowingYouBack, xSearchQuery)
    : [];

  const filteredXYouDoNotFollowBack = xInsights
    ? filterUsernames(xInsights.youDoNotFollowBack, xSearchQuery)
    : [];

  const filteredXMutuals = xInsights
    ? filterUsernames(xInsights.mutuals, xSearchQuery)
    : [];

  useEffect(() => {
    const savedSnapshots = localStorage.getItem(STORAGE_KEY);

    if (savedSnapshots) {
      setSnapshots(JSON.parse(savedSnapshots));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
  }, [snapshots]);

  async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    setIsProcessingFile(true);
    setProcessingProgress(5);
    setProcessingLabel("Preparing file...");
    setResults(null);
    setRelationshipInsights(null);
    setSearchQuery("");
    setRelationshipSearchQuery("");
    setStatusMessage("Reading file...");

    try {
      let followers = [];
      let following = [];
      let filesUsed = [];
      let ignoredCount = 0;
      let zipMessage = "";

      if (file.name.toLowerCase().endsWith(".zip")) {
        const zipResult = await extractInstagramDataFromZip(file, (progress) => {
          setProcessingProgress(progress.percent);
          setProcessingLabel(progress.label);
        });

        followers = zipResult.followers;
        following = zipResult.following;
        filesUsed = zipResult.filesUsed;
        ignoredCount = zipResult.ignoredCount;
        zipMessage = zipResult.message;
      } else {
        const text = await file.text();
        followers = extractUsernamesFromText(text, file.name);
      }

      setProcessingProgress(100);
      setProcessingLabel("Finished scanning.");

      setCurrentFollowers(followers);
      setCurrentFollowing(following);
      setCurrentFileName(file.name);
      setSnapshotName(file.name.replace(/\.[^/.]+$/, ""));

      if (followers.length > 0 && following.length > 0) {
        const insights = getRelationshipInsights(followers, following);
        setRelationshipInsights(insights);

        setStatusMessage(
          `${followers.length} followers and ${following.length} following loaded from ${file.name}. Ignored ${ignoredCount} unrelated file(s). Used: ${filesUsed.join(
            ", "
          )}`
        );
      } else if (followers.length > 0) {
        setStatusMessage(
          `${followers.length} follower usernames loaded from ${file.name}.`
        );
      } else {
        setStatusMessage(
          zipMessage ||
            "No follower usernames were found. Try uploading followers_1.html, followers_1.json, or a full Instagram data export ZIP."
        );
      }
    } catch (error) {
      setStatusMessage(
        "Something went wrong while reading this file. Try a JSON, HTML, TXT, CSV, or Instagram export ZIP."
      );
    } finally {
      setIsProcessingFile(false);
      event.target.value = "";
    }
  }

  async function handleXFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    setIsProcessingXFile(true);
    setXProcessingProgress(5);
    setXProcessingLabel("Preparing X archive...");
    setXInsights(null);
    setXSearchQuery("");
    setXStatusMessage("Reading X archive...");

    try {
      if (!file.name.toLowerCase().endsWith(".zip")) {
        setXStatusMessage("Please upload your full X/Twitter archive ZIP.");
        return;
      }

      const zipResult = await extractXDataFromZip(file, (progress) => {
        setXProcessingProgress(progress.percent);
        setXProcessingLabel(progress.label);
      });

      setXProcessingProgress(100);
      setXProcessingLabel("Finished scanning.");

      setXFollowers(zipResult.followers);
      setXFollowing(zipResult.following);

      if (zipResult.followers.length > 0 && zipResult.following.length > 0) {
        const insights = getRelationshipInsights(
          zipResult.followers,
          zipResult.following
        );

        setXInsights(insights);

        setXStatusMessage(
          `${zipResult.followers.length} X followers and ${zipResult.following.length} X following loaded. Ignored ${zipResult.ignoredCount} unrelated file(s). Used: ${zipResult.filesUsed.join(
            ", "
          )}`
        );
      } else {
        setXStatusMessage(
          zipResult.message ||
            "Could not find both follower.js and following.js in this archive."
        );
      }
    } catch {
      setXStatusMessage(
        "Something went wrong while reading this X archive. Try uploading the full X/Twitter archive ZIP."
      );
    } finally {
      setIsProcessingXFile(false);
      event.target.value = "";
    }
  }

  function saveSnapshot() {
    if (!currentFollowers.length) return;

    const finalSnapshotName =
      snapshotName.trim() || currentFileName || "Untitled snapshot";

    const newSnapshot = {
      id: crypto.randomUUID(),
      name: finalSnapshotName,
      originalFileName: currentFileName,
      createdAt: new Date().toISOString(),
      followers: currentFollowers,
      following: currentFollowing,
    };

    setSnapshots((previousSnapshots) => [newSnapshot, ...previousSnapshots]);
    setStatusMessage(`Snapshot "${finalSnapshotName}" saved.`);
    setResults(null);
    setSearchQuery("");
    setSnapshotName("");
  }

  function compareLatestTwoSnapshots() {
    if (snapshots.length < 2) {
      setStatusMessage("You need at least 2 saved snapshots to compare.");
      return;
    }

    const newestSnapshot = snapshots[0];
    const olderSnapshot = snapshots[1];

    const comparison = compareFollowers(
      olderSnapshot.followers,
      newestSnapshot.followers
    );

    setResults({
      ...comparison,
      olderSnapshot,
      newestSnapshot,
    });

    setSearchQuery("");
    setStatusMessage(
      `Compared ${olderSnapshot.name} against ${newestSnapshot.name}.`
    );
  }

  function compareCurrentUploadToLatestSnapshot() {
    if (!currentFollowers.length) {
      setStatusMessage("Upload a new follower file first.");
      return;
    }

    if (!snapshots.length) {
      setStatusMessage("Save at least one older snapshot first.");
      return;
    }

    const latestSavedSnapshot = snapshots[0];

    const comparison = compareFollowers(
      latestSavedSnapshot.followers,
      currentFollowers
    );

    const currentUploadName =
      snapshotName.trim() || currentFileName || "Current upload";

    setResults({
      ...comparison,
      olderSnapshot: latestSavedSnapshot,
      newestSnapshot: {
        name: currentUploadName,
        createdAt: new Date().toISOString(),
        followers: currentFollowers,
      },
    });

    setSearchQuery("");
    setStatusMessage(
      `Compared ${latestSavedSnapshot.name} against ${currentUploadName}.`
    );
  }

  function deleteSnapshot(snapshotId) {
    setSnapshots((previousSnapshots) =>
      previousSnapshots.filter((snapshot) => snapshot.id !== snapshotId)
    );

    setResults(null);
    setSearchQuery("");
    setStatusMessage("Snapshot deleted.");
  }

  function clearAllSnapshots() {
    const confirmed = window.confirm(
      "Are you sure you want to delete all saved snapshots?"
    );

    if (!confirmed) return;

    setSnapshots([]);
    setResults(null);
    setSearchQuery("");
    setStatusMessage("All snapshots cleared.");
  }

  function downloadCSV(rows, baseName) {
    const csvContent = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `${baseName}-${date}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  function exportResultsAsCSV() {
    if (!results) return;

    const rows = [
      ["type", "username"],
      ...results.unfollowed.map((username) => ["unfollowed", username]),
      ...results.newFollowers.map((username) => ["new_follower", username]),
    ];

    downloadCSV(rows, "followdrop-results");
    setStatusMessage("Results exported as CSV.");
  }

  function exportRelationshipCSV() {
    if (!relationshipInsights) return;

    const rows = [
      ["type", "username"],
      ...relationshipInsights.notFollowingYouBack.map((username) => [
        "not_following_you_back",
        username,
      ]),
      ...relationshipInsights.youDoNotFollowBack.map((username) => [
        "you_do_not_follow_back",
        username,
      ]),
      ...relationshipInsights.mutuals.map((username) => ["mutual", username]),
    ];

    downloadCSV(rows, "followdrop-relationship-insights");
    setStatusMessage("Relationship insights exported as CSV.");
  }

  function exportXRelationshipCSV() {
    if (!xInsights) return;

    const rows = [
      ["type", "username"],
      ...xInsights.notFollowingYouBack.map((username) => [
        "not_following_you_back",
        username,
      ]),
      ...xInsights.youDoNotFollowBack.map((username) => [
        "you_do_not_follow_back",
        username,
      ]),
      ...xInsights.mutuals.map((username) => ["mutual", username]),
    ];

    downloadCSV(rows, "followdrop-x-insights");
    setXStatusMessage("X insights exported as CSV.");
  }

  return (
    <main className="app">
      <section className="hero">
        <div className="hero-badge">Private social relationship insights</div>

        <h1>See who disappeared from your follower world.</h1>

        <p className="subtitle">
          FollowDrop scans your social data exports locally, compares followers
          and following, and helps you understand who follows back — without
          asking for your account password.
        </p>

        <div className="hero-actions">
          <a href="#upload-tool" className="hero-primary-link">
            Start scanning
          </a>
          <a href="#how-it-works" className="hero-secondary-link">
            See how it works
          </a>
        </div>

        <div className="trust-row">
          <div>
            <strong>No password</strong>
            <span>No social media login required</span>
          </div>

          <div>
            <strong>Local-first</strong>
            <span>Your snapshots stay in this browser</span>
          </div>

          <div>
            <strong>Export-ready</strong>
            <span>Download results as CSV</span>
          </div>
        </div>
      </section>

      <section className="mode-grid">
        <a href="#upload-tool" className="mode-card active-mode-card">
          <span>Instagram Mode</span>
          <h3>Instagram follower insights</h3>
          <p>
            Upload your Instagram export ZIP to scan followers, following,
            mutuals, and non-followbacks.
          </p>
          <strong>Available now →</strong>
        </a>

        <a href="#twitter-mode" className="mode-card active-mode-card">
          <span>Twitter/X Mode</span>
          <h3>X archive insights</h3>
          <p>
            Upload your X data archive to compare followers, following, and
            mutuals.
          </p>
          <strong>Available now →</strong>
        </a>

        <a href="#facebook-mode" className="mode-card">
          <span>Facebook Mode</span>
          <h3>Facebook relationship insights</h3>
          <p>
            Upload a Facebook data export and analyze available friends,
            followers, or following files.
          </p>
          <strong>Coming Soon →</strong>
        </a>
      </section>

      <section className="landing-grid">
        <div className="landing-card featured-card">
          <p className="card-kicker">Why FollowDrop?</p>
          <h2>Most unfollower apps feel sketchy. This one is built differently.</h2>
          <p>
            FollowDrop does not ask for your account password, does not log into
            your account, and does not scrape social platforms. You upload your
            own export, and the app analyzes it in your browser.
          </p>
        </div>

        <div className="landing-card">
          <h3>Relationship insights</h3>
          <p>
            See who does not follow you back, who you do not follow back, and
            who your mutuals are.
          </p>
        </div>

        <div className="landing-card">
          <h3>Snapshot tracking</h3>
          <p>
            Save follower snapshots over time and compare changes whenever you
            upload a newer export.
          </p>
        </div>
      </section>

      <section className="how-section" id="how-it-works">
        <div className="section-heading centered-heading">
          <div>
            <h2>How it works</h2>
            <p>Three simple steps. No third-party social media login.</p>
          </div>
        </div>

        <div className="steps-grid">
          <div className="step-card">
            <span>1</span>
            <h3>Upload your export</h3>
            <p>
              Upload your social data export ZIP, or a followers/following file
              from the platform.
            </p>
          </div>

          <div className="step-card">
            <span>2</span>
            <h3>Scan locally</h3>
            <p>
              FollowDrop finds follower and following files while ignoring
              unrelated files like contacts and blocked accounts.
            </p>
          </div>

          <div className="step-card">
            <span>3</span>
            <h3>Review insights</h3>
            <p>
              View mutuals, non-followbacks, new followers, unfollowers, and
              export your results.
            </p>
          </div>
        </div>
      </section>

      <section className="card" id="upload-tool">
        <div className="section-heading">
          <div>
            <h2>Instagram Mode</h2>
            <p>
              Upload a JSON, HTML, TXT, CSV, or full Instagram data export ZIP
              file.
            </p>
          </div>
        </div>

        <div className="single-upload">
          <input
            type="file"
            accept=".json,.html,.txt,.csv,.zip"
            onChange={handleFileUpload}
            disabled={isProcessingFile}
          />

          <div className="upload-stats">
            <strong>{currentFollowers.length}</strong>
            <span>followers loaded</span>
          </div>
        </div>

        {isProcessingFile && (
          <div className="progress-card">
            <div className="progress-header">
              <strong>Scanning export</strong>
              <span>{processingProgress}%</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${processingProgress}%` }}
              />
            </div>
            <p>{processingLabel}</p>
          </div>
        )}

        <div className="helper-card">
          <strong>Smart Instagram export support</strong>
          <p>
            FollowDrop looks for <span>followers_1.html</span> and{" "}
            <span>following.html</span>. It ignores files like{" "}
            <span>recently_unfollowed_profiles</span>,{" "}
            <span>synced_contacts</span>, blocked profiles, close friends, and
            follow requests.
          </p>
        </div>

        <div className="snapshot-name-field">
          <label htmlFor="snapshotName">Snapshot name</label>
          <input
            id="snapshotName"
            type="text"
            placeholder="Example: May 23 Instagram Followers"
            value={snapshotName}
            onChange={(event) => setSnapshotName(event.target.value)}
          />
        </div>

        {statusMessage && <p className="status-message">{statusMessage}</p>}

        <div className="button-row">
          <button
            className="primary-button"
            onClick={saveSnapshot}
            disabled={!currentFollowers.length || isProcessingFile}
          >
            Save snapshot
          </button>

          <button
            className="secondary-button"
            onClick={compareCurrentUploadToLatestSnapshot}
            disabled={
              !currentFollowers.length || !snapshots.length || isProcessingFile
            }
          >
            Compare upload to latest saved
          </button>

          <button
            className="secondary-button"
            onClick={compareLatestTwoSnapshots}
            disabled={snapshots.length < 2 || isProcessingFile}
          >
            Compare latest two saved
          </button>
        </div>
      </section>

      {relationshipInsights && (
        <section className="relationship-section">
          <div className="section-heading">
            <div>
              <h2>Instagram relationship insights</h2>
              <p>
                Based on the followers and following files from your Instagram
                export.
              </p>
            </div>

            <button
              className="export-button compact"
              onClick={exportRelationshipCSV}
            >
              Export insights CSV
            </button>
          </div>

          <div className="relationship-stats">
            <div className="metric-card">
              <span>Not following you back</span>
              <strong>{relationshipInsights.notFollowingYouBack.length}</strong>
            </div>

            <div className="metric-card">
              <span>You do not follow back</span>
              <strong>{relationshipInsights.youDoNotFollowBack.length}</strong>
            </div>

            <div className="metric-card">
              <span>Mutuals</span>
              <strong>{relationshipInsights.mutuals.length}</strong>
            </div>
          </div>

          <div className="search-card relationship-search">
            <label htmlFor="relationshipSearch">Search Instagram lists</label>
            <div className="search-row">
              <input
                id="relationshipSearch"
                type="text"
                placeholder="Search username..."
                value={relationshipSearchQuery}
                onChange={(event) =>
                  setRelationshipSearchQuery(event.target.value)
                }
              />

              {relationshipSearchQuery && (
                <button
                  className="clear-search-button"
                  onClick={() => setRelationshipSearchQuery("")}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="relationship-grid">
            <div className="result-card">
              <h2>Not following you back</h2>
              <p className="list-description">
                People you follow who do not follow you.
              </p>

              {filteredNotFollowingYouBack.length === 0 ? (
                <p className="empty">No usernames found.</p>
              ) : (
                <ul>
                  {filteredNotFollowingYouBack.map((name) => (
                    <li key={name}>@{name}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="result-card">
              <h2>You do not follow back</h2>
              <p className="list-description">
                People who follow you, but you do not follow.
              </p>

              {filteredYouDoNotFollowBack.length === 0 ? (
                <p className="empty">No usernames found.</p>
              ) : (
                <ul>
                  {filteredYouDoNotFollowBack.map((name) => (
                    <li key={name}>@{name}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="result-card">
              <h2>Mutuals</h2>
              <p className="list-description">
                People you follow who also follow you.
              </p>

              {filteredMutuals.length === 0 ? (
                <p className="empty">No usernames found.</p>
              ) : (
                <ul>
                  {filteredMutuals.map((name) => (
                    <li key={name}>@{name}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="card" id="twitter-mode">
        <div className="section-heading">
          <div>
            <p className="card-kicker">Twitter/X Mode</p>
            <h2>X archive insights</h2>
            <p>
              Upload your full X/Twitter archive ZIP. FollowDrop will look for
              follower.js and following.js.
            </p>
          </div>
        </div>

        <div className="single-upload">
          <input
            type="file"
            accept=".zip"
            onChange={handleXFileUpload}
            disabled={isProcessingXFile}
          />

          <div className="upload-stats">
            <strong>{xFollowers.length}</strong>
            <span>X followers loaded</span>
          </div>
        </div>

        {isProcessingXFile && (
          <div className="progress-card">
            <div className="progress-header">
              <strong>Scanning X archive</strong>
              <span>{xProcessingProgress}%</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${xProcessingProgress}%` }}
              />
            </div>
            <p>{xProcessingLabel}</p>
          </div>
        )}

        <div className="helper-card">
          <strong>Smart X archive support</strong>
          <p>
            FollowDrop looks for <span>follower.js</span> and{" "}
            <span>following.js</span>. It ignores unrelated files like tweets,
            likes, ads, muted accounts, blocked accounts, and contacts.
          </p>
        </div>

        {xStatusMessage && <p className="status-message">{xStatusMessage}</p>}
      </section>

      {xInsights && (
        <section className="relationship-section">
          <div className="section-heading">
            <div>
              <h2>Twitter/X relationship insights</h2>
              <p>
                Based on follower.js and following.js from your X/Twitter
                archive.
              </p>
            </div>

            <button
              className="export-button compact"
              onClick={exportXRelationshipCSV}
            >
              Export X insights CSV
            </button>
          </div>

          <div className="relationship-stats">
            <div className="metric-card">
              <span>Not following you back</span>
              <strong>{xInsights.notFollowingYouBack.length}</strong>
            </div>

            <div className="metric-card">
              <span>You do not follow back</span>
              <strong>{xInsights.youDoNotFollowBack.length}</strong>
            </div>

            <div className="metric-card">
              <span>Mutuals</span>
              <strong>{xInsights.mutuals.length}</strong>
            </div>
          </div>

          <div className="search-card relationship-search">
            <label htmlFor="xSearch">Search X lists</label>
            <div className="search-row">
              <input
                id="xSearch"
                type="text"
                placeholder="Search username..."
                value={xSearchQuery}
                onChange={(event) => setXSearchQuery(event.target.value)}
              />

              {xSearchQuery && (
                <button
                  className="clear-search-button"
                  onClick={() => setXSearchQuery("")}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="relationship-grid">
            <div className="result-card">
              <h2>Not following you back</h2>
              <p className="list-description">
                Accounts you follow who do not follow you.
              </p>

              {filteredXNotFollowingYouBack.length === 0 ? (
                <p className="empty">No usernames found.</p>
              ) : (
                <ul>
                  {filteredXNotFollowingYouBack.map((name) => (
                    <li key={name}>@{name}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="result-card">
              <h2>You do not follow back</h2>
              <p className="list-description">
                Accounts who follow you, but you do not follow.
              </p>

              {filteredXYouDoNotFollowBack.length === 0 ? (
                <p className="empty">No usernames found.</p>
              ) : (
                <ul>
                  {filteredXYouDoNotFollowBack.map((name) => (
                    <li key={name}>@{name}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="result-card">
              <h2>Mutuals</h2>
              <p className="list-description">
                Accounts you follow who also follow you.
              </p>

              {filteredXMutuals.length === 0 ? (
                <p className="empty">No usernames found.</p>
              ) : (
                <ul>
                  {filteredXMutuals.map((name) => (
                    <li key={name}>@{name}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="coming-mode-section" id="facebook-mode">
        <div>
          <p className="card-kicker">Facebook Mode</p>
          <h2>Facebook export support is coming soon.</h2>
          <p>
            Facebook data exports vary more than Instagram and X, so this mode
            should be built after testing a real Facebook export ZIP.
          </p>
        </div>

        <div className="coming-mode-badge">Coming Soon</div>
      </section>

      <section className="snapshot-layout">
        <div className="card">
          <div className="section-heading">
            <div>
              <h2>Saved Instagram snapshots</h2>
              <p>{snapshots.length} saved locally in this browser.</p>
            </div>

            {snapshots.length > 0 && (
              <button className="danger-button" onClick={clearAllSnapshots}>
                Clear all
              </button>
            )}
          </div>

          {snapshots.length === 0 ? (
            <p className="empty">No snapshots saved yet.</p>
          ) : (
            <div className="snapshot-list">
              {snapshots.map((snapshot, index) => (
                <div className="snapshot-item" key={snapshot.id}>
                  <div>
                    <p className="snapshot-title">
                      {index === 0 ? "Latest: " : ""}
                      {snapshot.name}
                    </p>
                    <p className="snapshot-meta">
                      {formatDate(snapshot.createdAt)} •{" "}
                      {snapshot.followers.length} followers
                      {snapshot.following?.length
                        ? ` • ${snapshot.following.length} following`
                        : ""}
                    </p>
                  </div>

                  <button
                    className="small-danger-button"
                    onClick={() => deleteSnapshot(snapshot.id)}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {results && (
          <div className="results-column">
            <div className="comparison-summary">
              <p>Comparison</p>
              <strong>
                {results.olderSnapshot.name} → {results.newestSnapshot.name}
              </strong>

              <button className="export-button" onClick={exportResultsAsCSV}>
                Export results as CSV
              </button>
            </div>

            <div className="search-card">
              <label htmlFor="resultSearch">Search results</label>
              <div className="search-row">
                <input
                  id="resultSearch"
                  type="text"
                  placeholder="Search username..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />

                {searchQuery && (
                  <button
                    className="clear-search-button"
                    onClick={() => setSearchQuery("")}
                  >
                    Clear
                  </button>
                )}
              </div>

              {searchQuery && (
                <p className="search-summary">
                  Showing {filteredUnfollowed.length} unfollowed and{" "}
                  {filteredNewFollowers.length} new follower matches.
                </p>
              )}
            </div>

            <div className="result-card">
              <h2>Unfollowed you</h2>
              <p className="count">{results.unfollowed.length}</p>

              {filteredUnfollowed.length === 0 ? (
                <p className="empty">
                  {searchQuery
                    ? "No unfollowed users match your search."
                    : "No missing followers found."}
                </p>
              ) : (
                <ul>
                  {filteredUnfollowed.map((name) => (
                    <li key={name}>@{name}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="result-card">
              <h2>New followers</h2>
              <p className="count">{results.newFollowers.length}</p>

              {filteredNewFollowers.length === 0 ? (
                <p className="empty">
                  {searchQuery
                    ? "No new followers match your search."
                    : "No new followers found."}
                </p>
              ) : (
                <ul>
                  {filteredNewFollowers.map((name) => (
                    <li key={name}>@{name}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="faq-section">
        <div className="section-heading centered-heading">
          <div>
            <h2>Privacy notes</h2>
            <p>Important details about how this MVP works.</p>
          </div>
        </div>

        <div className="faq-grid">
          <div className="faq-card">
            <h3>Do I enter my account password?</h3>
            <p>No. FollowDrop does not ask for your login information.</p>
          </div>

          <div className="faq-card">
            <h3>Does it automatically check social apps?</h3>
            <p>
              No. This MVP works by analyzing export files that you provide.
            </p>
          </div>

          <div className="faq-card">
            <h3>Where are snapshots stored?</h3>
            <p>
              Saved snapshots are stored in your browser’s local storage on this
              device.
            </p>
          </div>

          <div className="faq-card">
            <h3>Can I export my results?</h3>
            <p>
              Yes. You can export follower-change results and relationship
              insights as CSV files.
            </p>
          </div>
        </div>
      </section>

      <footer className="footer">
        <strong>FollowDrop</strong>
        <span>Private social insights without password sharing.</span>
      </footer>
    </main>
  );
}

export default App;