const ROOT_FOLDER_ID_DEFAULT = "17mLY-shklRGCZWQfq8AbrPkPTRcOUv2z";
const DATABASE_FOLDER_ID_DEFAULT = "12bgu_6ljemJOkFBKM_ECzVy47eS2OJvP";
const UUID_SHEET_ID_DEFAULT = "18OMUmDf5137YppbynoAbAt65B4R5MLhewjTTlMPJp98";
var RESOURCE_PORTAL_ROOT_FOLDER_ID_DEFAULT = "19LoMUsogxTHB5xrI1Gd08NASQv2Zqi6E";
var RESOURCE_DASHBOARD_INDEX_FOLDER_ID_DEFAULT = "1cP2FBOW-Jryu9eknJgDjUZcxx9qwC22Z";

const MAX_RUNTIME_MS = 240000;
const CACHE_CHUNK_SIZE = 20000;
const CACHE_TTL_SECONDS = 21600;
const METADATA_CACHE_TTL_MS = 60000;
const SUBJECT_SCHEMA_VERSION = "10";
const BACKEND_PAYLOAD_SCHEMA_VERSION = 2;
const MINIMUM_SUPPORTED_CLIENT_VERSION = "26.10.20";
const UUID_SHEET_COLUMN_COUNT = 7;
const BUILDER_LOCK_TIMEOUT_MS = 15000;
const REVIEWER_SESSION_PROPERTY_PREFIX = "Session_";
const REVIEWER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REVIEWER_SESSION_LIMIT = 1000;
const REVIEWER_SESSION_PER_ACCOUNT_LIMIT = 10;
const REVIEWER_SESSION_PROPERTY_STORE_BUDGET_BYTES = 400 * 1024;
const REVIEWER_SESSION_PROPERTY_MAX_BYTES = 9 * 1024;
const MRH_CENTRAL_LOG_SPREADSHEET_ID_DEFAULT =
  "1xogiiA1GqYsAaH1EimSU7gfIWT6Oog3kd7Zw4lnDryA";
const CACHE_FOLDER_ID_PROPERTY = "MRH_CACHE_FOLDER_ID";
const BUILD_STATE_FILE_NAME = "BuildState.json";
const FILE_INDEX_FILE_NAME = "FileIndex.json";
const UUID_METADATA_BACKUP_FILE_NAME = "UUID_Backup.json";
const RESUME_TRIGGER_HANDLER = "resumeBuildDatabaseCache";
// Optional, backward-compatible architecture upgrades. Enable only after the
// private Storage bucket / SQL migration and frontend are deployed.
const MRH_PDF_STORAGE_BUCKET_PROPERTY_ = "MRH_SUPABASE_PDF_BUCKET";
const MRH_PDF_SIGNED_URL_ENABLED_PROPERTY_ = "MRH_PDF_SIGNED_URL_ENABLED";
const MRH_PDF_ATOMIC_AUDIT_ENABLED_PROPERTY_ = "MRH_PDF_ATOMIC_AUDIT_ENABLED";
const MRH_PDF_SIGNED_URL_TTL_SECONDS_ = 300;
const MRH_PDF_BUCKET_PRIVACY_CACHE_TTL_SECONDS_ = 30;
const MRH_CACHE_BUILD_LEASE_PROPERTY_ = "MRH_CACHE_BUILD_LEASE_V1";
const MRH_CACHE_BUILD_GENERATION_PROPERTY_ = "MRH_CACHE_BUILD_GENERATION_V1";
const MRH_CACHE_BUILD_LEASE_TTL_MS_ = 8 * 60 * 1000;
// Refresh only near expiry; never wait on the global lock at every source boundary.
const MRH_CACHE_BUILD_LEASE_REFRESH_THRESHOLD_MS_ = 5 * 60 * 1000;
const MRH_CACHE_BUILD_LEASE_REFRESH_LOCK_TIMEOUT_MS_ = 250;

const MRH_SUPABASE_ACCOUNTS_TABLE = "mrh_accounts";
const MRH_SUPABASE_ACTIVITY_TABLE = "mrh_activity_logs";
const MRH_SUPABASE_WEBSITE_LOGS_TABLE = "mrh_website_logs";
const MRH_SUPABASE_RATE_LIMIT_RPC = "mrh_apply_rate_limit";
const MRH_SUPABASE_BATCH_SIZE = 100;
const MRH_SUPABASE_REQUIRED_COLUMNS_ = {
  mrh_accounts: [
    "id",
    "email",
    "last_name",
    "first_name",
    "middle_initial",
    "active",
    "created_date",
    "created_time",
    "last_access_date",
    "last_access_time",
    "permanent_pdf_issuance_id",
    "legacy_metadata",
    "updated_at",
  ],
  mrh_activity_logs: [
    "id",
    "area",
    "source_event_id",
    "audit_event_id",
    "legacy_source",
    "legacy_row",
    "legacy_date",
    "legacy_time",
    "email",
    "last_name",
    "first_name",
    "middle_initial",
    "event",
    "course_code",
    "year",
    "semester",
    "category",
    "course",
    "resource",
    "issuance_reference",
    "source_file_id",
    "record",
    "created_at",
  ],
  mrh_website_logs: [
    "id",
    "log_group",
    "logged_at",
    "legacy_source",
    "legacy_row",
    "legacy_date",
    "legacy_time",
    "severity",
    "event",
    "outcome",
    "method",
    "handler",
    "request_type",
    "correlation_id",
    "duration_ms",
    "response_code",
    "client_version",
    "error_name",
    "error_message",
    "stack",
    "active_user_available",
    "verified_account_email",
    "activity",
    "resource_id",
    "resource_name",
    "resource_area",
    "course",
    "year",
    "semester",
    "category",
    "issuance_reference",
    "audit_event_id",
    "detail",
    "query_parameters",
    "payload_text",
    "summary",
    "record",
  ],
};

function validateMRHSupabaseSchema_() {
  Object.keys(MRH_SUPABASE_REQUIRED_COLUMNS_).forEach(function (tableName) {
    var columns = MRH_SUPABASE_REQUIRED_COLUMNS_[tableName];
    // Selecting explicit columns catches incomplete/mismatched schemas; select=* would not.
    mrhSupabaseSelect_(tableName, "select=" + columns.join(",") + "&limit=0");
  });
  var rateLimitProbe = mrhSupabaseRpc_(MRH_SUPABASE_RATE_LIMIT_RPC, {
    p_scope: "deck_password",
    p_identity_hash: sha256Hex("mrh-rate-limit-schema-probe-v1"),
    p_event_hash: null,
    p_consume: false,
  });
  if (!rateLimitProbe || typeof rateLimitProbe.allowed !== "boolean")
    throw new Error("Persistent Supabase rate-limit RPC returned an invalid response.");
  return true;
}

// Per-execution memo for configuration that is read from Script Properties.
// Apps Script re-evaluates top-level code on every invocation, so this never
// outlives a single request; it only removes repeated PropertiesService reads
// within one request. A throwing lookup is never memoized.
var MRH_EXECUTION_CONFIG_MEMO_ = Object.create(null);

function getMRHSupabaseConfig_() {
  if (!MRH_EXECUTION_CONFIG_MEMO_.supabase)
    MRH_EXECUTION_CONFIG_MEMO_.supabase = getMRHSupabaseConfigUncached_();
  return Object.assign({}, MRH_EXECUTION_CONFIG_MEMO_.supabase);
}

function getMRHSupabaseConfigUncached_() {
  // This backend is production-only. No deployment-environment selector or
  // alternate credential fallback is permitted.
  var props = PropertiesService.getScriptProperties();
  var url = String(props.getProperty("MRH_SUPABASE_URL") || "")
    .trim()
    .replace(/\/$/, "");
  var secretKey = String(props.getProperty("MRH_SUPABASE_SECRET_KEY") || "").trim();
  var validUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url);
  var validKey =
    /^sb_secret_[A-Za-z0-9_-]+$/.test(secretKey) ||
    /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(secretKey);
  return {
    url: validUrl ? url : "",
    secretKey: validKey ? secretKey : "",
    enabled: validUrl && validKey,
    storeId: validUrl ? url : "unconfigured-supabase",
  };
}

function mrhSupabaseRequest_(table, method, query, body, prefer) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(String(table || "")))
    throw new Error("Invalid Supabase table name.");
  return mrhSupabaseRequestEndpoint_(table, table, method, query, body, prefer);
}

function mrhSupabaseRpc_(functionName, args) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(String(functionName || "")))
    throw new Error("Invalid Supabase RPC function name.");
  return mrhSupabaseRequestEndpoint_(
    "rpc/" + functionName,
    "RPC " + functionName,
    "post",
    "",
    args || {},
    "return=representation",
  );
}

function mrhSupabaseRequestEndpoint_(endpoint, endpointLabel, method, query, body, prefer) {
  if (!/^(?:[a-z][a-z0-9_]{0,62}|rpc\/[a-z][a-z0-9_]{0,62})$/.test(String(endpoint || "")))
    throw new Error("Invalid Supabase REST endpoint.");
  var config = getMRHSupabaseConfig_();
  if (!config.enabled)
    throw new Error(
      "Supabase storage is not configured. Set the server-side Supabase URL and secret key in Script Properties.",
    );
  var url = config.url + "/rest/v1/" + endpoint + (query ? "?" + query : "");
  var headers = { apikey: config.secretKey, Accept: "application/json" };
  // New sb_secret keys are opaque API keys, not JWTs; do not send them as Bearer tokens.
  if (/^eyJ/.test(config.secretKey)) headers.Authorization = "Bearer " + config.secretKey;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  var options = {
    method: String(method || "get").toLowerCase(),
    headers: headers,
    muteHttpExceptions: true,
  };
  if (body !== undefined) options.payload = JSON.stringify(body);
  var response = mrhLoggedUrlFetch_(url, options, { provider: "Supabase", table: endpointLabel });
  var statusCode = response.getResponseCode();
  var responseText = response.getContentText() || "";
  var parsed = null;
  if (responseText) {
    try { parsed = JSON.parse(responseText); }
    catch (parseError) { parsed = responseText; }
  }
  if (statusCode < 200 || statusCode >= 300) {
    var responseObject = parsed && typeof parsed === "object" ? parsed : {};
    var message = String(responseObject.message || responseObject.details || responseObject.hint || "Supabase request failed.");
    var safeMessage = typeof sanitizeCentralLogText_ === "function"
      ? sanitizeCentralLogText_(message).slice(0, 500)
      : message.slice(0, 500);
    var error = new Error(
      "Supabase " + endpointLabel + " request failed (HTTP " + statusCode + "): " + safeMessage,
    );
    error.httpStatus = statusCode;
    error.code = String(responseObject.code || "SUPABASE_REQUEST_FAILED");
    throw error;
  }
  return parsed;
}

function cleanupMRHPersistentRateLimitState() {
  var deleted = mrhSupabaseRpc_("mrh_cleanup_rate_limit_state", {});
  var count = Number(deleted);
  if (!Number.isFinite(count) || count < 0)
    throw new Error("Persistent rate-limit cleanup RPC returned an invalid deleted-row count.");
  LoggerService.log("INFO", "API_CALL", "Expired persistent rate-limit state cleaned", { deletedRows: Math.floor(count) }, "cleanupMRHPersistentRateLimitState");
  return { status: "success", deletedRows: Math.floor(count) };
}

function setupMRHPersistentRateLimitCleanupTrigger() {
  // Verify that the persistent store and RPC are configured before creating a trigger.
  var probe = mrhSupabaseRpc_(MRH_SUPABASE_RATE_LIMIT_RPC, {
    p_scope: "deck_password",
    p_identity_hash: sha256Hex("mrh-rate-limit-cleanup-setup-probe-v1"),
    p_event_hash: null,
    p_consume: false,
  });
  if (!probe || typeof probe.allowed !== "boolean")
    throw new Error("Persistent rate-limit store is not ready.");
  // Also verify the cleanup RPC exists and its service-role grants are correct.
  cleanupMRHPersistentRateLimitState();
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "cleanupMRHPersistentRateLimitState")
      return { status: "already_installed" };
  }
  ScriptApp.newTrigger("cleanupMRHPersistentRateLimitState").timeBased().everyDays(1).atHour(3).create();
  LoggerService.log("INFO", "TRIGGER", "Daily persistent rate-limit cleanup trigger installed", { schedule: "daily around 03:00 script time zone" }, "setupMRHPersistentRateLimitCleanupTrigger");
  return { status: "installed" };
}

/**
 * Supabase Storage helpers for private, version-addressed Reviewer PDFs.
 * These are deliberately opt-in: the legacy JSON/Base64 response remains the
 * default until the private bucket and the frontend signed-URL contract exist.
 */
function reviewerPdfSignedDeliveryRequested_(data) {
  if (!data || String(data.preferDeliveryMode || "").trim().toLowerCase() !== "signed-url")
    return false;
  var properties = getScriptProps();
  if (String(properties.getProperty(MRH_PDF_SIGNED_URL_ENABLED_PROPERTY_) || "").toLowerCase() !== "true")
    return false;
  var bucket = String(properties.getProperty(MRH_PDF_STORAGE_BUCKET_PROPERTY_) || "").trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(bucket)) return false;
  return getMRHSupabaseConfig_().enabled;
}

function reviewerPdfStorageObjectPath_(fileId, sourceVersion) {
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(String(fileId || "")) ||
      !/^[a-f0-9]{64}$/i.test(String(sourceVersion || "")))
    throw new Error("Invalid protected PDF storage identity.");
  // Do not expose the original Drive file ID in the storage object name.
  return sha256Hex(String(fileId)) + "/" + String(sourceVersion).toLowerCase() + ".pdf";
}

function assertReviewerPdfStorageBucketPrivate_() {
  var config = getMRHSupabaseConfig_();
  var properties = getScriptProps();
  var bucket = String(properties.getProperty(MRH_PDF_STORAGE_BUCKET_PROPERTY_) || "").trim();
  if (!config.enabled || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(bucket))
    throw new Error("The private Reviewer PDF Storage bucket is not configured.");
  var memoKey = config.url + ":" + bucket;
  if (MRH_EXECUTION_CONFIG_MEMO_.privateReviewerPdfBucket === memoKey) return true;
  // Bucket configuration is administrative, not user-controlled. A brief
  // cache avoids an extra Storage metadata round-trip on every PDF request;
  // cache misses/evictions still fail closed by rechecking the bucket API.
  var privacyCacheKey = "mrh_pdf_bucket_private_v1_" + sha256Hex(memoKey);
  try {
    var privacyCache = CacheService.getScriptCache();
    if (privacyCache.get(privacyCacheKey) === "private") {
      MRH_EXECUTION_CONFIG_MEMO_.privateReviewerPdfBucket = memoKey;
      return true;
    }
  } catch (privacyCacheReadError) {
    // A cache outage must not disable PDF delivery; verify the bucket directly.
  }
  var headers = { apikey: config.secretKey, Accept: "application/json" };
  if (/^eyJ/.test(config.secretKey)) headers.Authorization = "Bearer " + config.secretKey;
  var response = mrhLoggedUrlFetch_(config.url + "/storage/v1/bucket/" + encodeURIComponent(bucket), {
    method: "get", headers: headers, muteHttpExceptions: true,
  }, { provider: "SupabaseStorage", operation: "verify_private_reviewer_pdf_bucket" });
  var status = response.getResponseCode();
  var body = response.getContentText() || "";
  var parsed = null;
  try { parsed = body ? JSON.parse(body) : null; } catch (ignored) { parsed = null; }
  if (status < 200 || status >= 300 || !parsed || parsed.public !== false)
    throw new Error("Reviewer PDF Storage bucket must exist and be private; signed delivery was refused.");
  MRH_EXECUTION_CONFIG_MEMO_.privateReviewerPdfBucket = memoKey;
  try {
    CacheService.getScriptCache().put(
      privacyCacheKey,
      "private",
      MRH_PDF_BUCKET_PRIVACY_CACHE_TTL_SECONDS_,
    );
  } catch (privacyCacheWriteError) {
    // Privacy has been verified remotely; cache persistence is only an optimization.
  }
  return true;
}

/** Run manually before enabling signed delivery to verify the configured bucket. */
function verifyReviewerPdfStorageBucketConfiguration() {
  assertReviewerPdfStorageBucketPrivate_();
  var properties = getScriptProps();
  return {
    status: "success",
    privateBucketVerified: true,
    bucket: String(properties.getProperty(MRH_PDF_STORAGE_BUCKET_PROPERTY_) || "").trim(),
    signedUrlTtlSeconds: MRH_PDF_SIGNED_URL_TTL_SECONDS_,
  };
}

function mrhSupabaseStorageRequest_(operation, objectPath, method, payload, contentType) {
  var config = getMRHSupabaseConfig_();
  if (!config.enabled) throw new Error("Supabase storage is not configured.");
  var properties = getScriptProps();
  var bucket = String(properties.getProperty(MRH_PDF_STORAGE_BUCKET_PROPERTY_) || "").trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(bucket))
    throw new Error("The private Reviewer PDF Storage bucket is not configured.");
  if (["sign", "upload"].indexOf(operation) === -1)
    throw new Error("Invalid protected PDF storage operation.");
  var pathParts = String(objectPath || "").split("/");
  if (!pathParts.length || pathParts.some(function (part) {
    return !/^[A-Za-z0-9._-]{1,160}$/.test(part) || part === "." || part === "..";
  })) throw new Error("Invalid protected PDF storage path.");
  assertReviewerPdfStorageBucketPrivate_();
  var encodedPath = pathParts.map(function (part) { return encodeURIComponent(part); }).join("/");
  var route = operation === "sign"
    ? "object/sign/" + encodeURIComponent(bucket) + "/" + encodedPath
    : "object/" + encodeURIComponent(bucket) + "/" + encodedPath;
  var url = config.url + "/storage/v1/" + route;
  var headers = { apikey: config.secretKey, Accept: "application/json" };
  if (/^eyJ/.test(config.secretKey)) headers.Authorization = "Bearer " + config.secretKey;
  var options = {
    method: String(method || "post").toLowerCase(),
    headers: headers,
    muteHttpExceptions: true,
  };
  if (contentType) headers["Content-Type"] = contentType;
  if (operation === "upload") headers["x-upsert"] = "true";
  var requestMethod = String(method || "post").toLowerCase();
  if (requestMethod !== "post")
    throw new Error("Protected PDF Storage only permits the expected POST operations.");
  options.method = requestMethod;
  if (payload !== undefined) options.payload = payload;
  var response = mrhLoggedUrlFetch_(url, options, {
    provider: "SupabaseStorage",
    operation: operation === "sign" ? "sign_reviewer_pdf" : "upload_reviewer_pdf",
  });
  var statusCode = response.getResponseCode();
  var responseText = response.getContentText() || "";
  var parsed = null;
  if (responseText) {
    try { parsed = JSON.parse(responseText); } catch (ignored) { parsed = null; }
  }
  if (statusCode < 200 || statusCode >= 300) {
    var storageMessage = parsed && typeof parsed === "object"
      ? String(parsed.message || parsed.error || parsed.statusCode || "Storage request failed")
      : "Storage request failed";
    var storageError = new Error("Supabase protected-PDF storage request failed (HTTP " + statusCode + "): " + sanitizeCentralLogText_(storageMessage).slice(0, 250));
    storageError.httpStatus = statusCode;
    storageError.code = "SUPABASE_PDF_STORAGE_FAILED";
    throw storageError;
  }
  return parsed || {};
}

function createReviewerPdfStorageSignedUrl_(fileId, sourceVersion, downloadFileName, issuancePurpose) {
  var objectPath = reviewerPdfStorageObjectPath_(fileId, sourceVersion);
  var signedResult = mrhSupabaseStorageRequest_(
    "sign", objectPath, "post", JSON.stringify({ expiresIn: MRH_PDF_SIGNED_URL_TTL_SECONDS_ }), "application/json",
  );
  var signedPath = String((signedResult && signedResult.signedURL) || "").trim();
  if (!signedPath || signedPath.charAt(0) !== "/" || /^\/\//.test(signedPath) || /[\r\n\\#]/.test(signedPath))
    throw new Error("Supabase returned an invalid protected-PDF signed URL.");

  // Accept only this exact bucket/object signing route and require the token.
  // Do not turn an unexpected Storage API path into a link for the browser.
  var queryIndex = signedPath.indexOf("?");
  if (queryIndex <= 0 || queryIndex === signedPath.length - 1)
    throw new Error("Supabase returned an incomplete protected-PDF signed URL.");
  var signedPathOnly = signedPath.substring(0, queryIndex);
  var signedQuery = signedPath.substring(queryIndex + 1);
  if (signedPathOnly.indexOf("/storage/v1/") === 0)
    signedPathOnly = signedPathOnly.substring("/storage/v1".length);
  var properties = getScriptProps();
  var bucket = String(properties.getProperty(MRH_PDF_STORAGE_BUCKET_PROPERTY_) || "").trim();
  var expectedPath = "/object/sign/" + encodeURIComponent(bucket) + "/" + objectPath.split("/").map(function (part) {
    return encodeURIComponent(part);
  }).join("/");
  if (signedPathOnly !== expectedPath || !/(?:^|&)token=[^&]+/.test(signedQuery))
    throw new Error("Supabase returned an unexpected protected-PDF signed URL path or token.");

  var config = getMRHSupabaseConfig_();
  var signedUrl = config.url + "/storage/v1" + signedPathOnly + "?" + signedQuery;
  if (String(issuancePurpose || "").toUpperCase() === "DOWNLOAD") {
    var safeFileName = String(downloadFileName || "reviewer.pdf").replace(/[\r\n\x00-\x1f\x7f]/g, "_").slice(0, 180) || "reviewer.pdf";
    signedUrl += "&download=" + encodeURIComponent(safeFileName);
  }
  return signedUrl;
}

function uploadReviewerPdfAndCreateSignedUrl_(fileId, sourceVersion, sourceBytes, downloadFileName, issuancePurpose) {
  if (!sourceBytes || !Number.isSafeInteger(sourceBytes.length) || sourceBytes.length < 5 || sourceBytes.length > REVIEWER_PDF_MAX_SOURCE_BYTES_)
    throw new Error("The protected PDF source size is invalid for Storage upload.");
  var objectPath = reviewerPdfStorageObjectPath_(fileId, sourceVersion);
  mrhSupabaseStorageRequest_("upload", objectPath, "post", sourceBytes, "application/pdf");
  return createReviewerPdfStorageSignedUrl_(fileId, sourceVersion, downloadFileName, issuancePurpose);
}

function mrhSupabaseRows_(result) {
  // PostgREST normally returns arrays, but a single-object insert payload with
  // return=representation can produce one object. Normalize both forms.
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") return [result];
  return [];
}

function mrhSupabaseSelect_(table, query) {
  var result = mrhSupabaseRequest_(table, "get", query, undefined, "");
  return mrhSupabaseRows_(result);
}

function encodeMRHSupabaseFilterValue_(value) {
  // encodeURIComponent leaves a few reserved characters unescaped; force those
  // to percent-encoding before embedding values in PostgREST filter expressions.
  return encodeURIComponent(String(value == null ? "" : value)).replace(
    /[!'()*]/g,
    function (character) {
      return "%" + character.charCodeAt(0).toString(16).toUpperCase();
    },
  );
}

function mrhSupabaseUpsertBatch_(table, rows, conflictColumns) {
  var allRows = Array.isArray(rows) ? rows : [];
  if (!allRows.length) return 0;
  var chunkSize = MRH_SUPABASE_BATCH_SIZE;
  var written = 0;
  for (var offset = 0; offset < allRows.length; offset += chunkSize) {
    var chunk = allRows.slice(offset, offset + chunkSize);
    var query = "select=id";
    if (conflictColumns)
      query =
        "on_conflict=" + encodeURIComponent(conflictColumns) + "&" + query;
    var result = mrhSupabaseRequest_(
      table,
      "post",
      query,
      chunk,
      "resolution=merge-duplicates,return=representation",
    );
    var returnedRows = mrhSupabaseRows_(result);
    if (returnedRows.length !== chunk.length)
      throw new Error(
        "Supabase confirmed an unexpected number of rows while importing " +
          table +
          ".",
      );
    written += returnedRows.length;
  }
  return written;
}

function mrhSupabaseImportAccountsIfMissing_(rows) {
  var allRows = Array.isArray(rows) ? rows : [];
  var processed = 0;
  var chunkSize = MRH_SUPABASE_BATCH_SIZE;
  for (var offset = 0; offset < allRows.length; offset += chunkSize) {
    var chunk = allRows.slice(offset, offset + chunkSize);
    // Ignore email conflicts so re-running a partially completed import never
    // overwrites account status/profile changes made in Supabase after cutover.
    mrhSupabaseRequest_(
      MRH_SUPABASE_ACCOUNTS_TABLE,
      "post",
      "on_conflict=email",
      chunk,
      "resolution=ignore-duplicates,return=minimal",
    );
    processed += chunk.length;
  }
  return processed;
}

var TextUtils = {
  naturalSortStrings: function (left, right) {
    var a = String(left == null ? "" : left)
      .trim()
      .toLowerCase();
    var b = String(right == null ? "" : right)
      .trim()
      .toLowerCase();
    return a.localeCompare(b, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  },
};

var deckMetadataCache = null;
var deckMetadataCacheTime = 0;

/* -------------------------------------------------------------------------- */
/* Generic utilities                                                          */
/* -------------------------------------------------------------------------- */

function scheduledDatabaseSync() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(BUILDER_LOCK_TIMEOUT_MS)) return;
  var shouldBuild = false;
  try {
    var props = getScriptProps();
    if (isDatabaseCacheBuildLeaseActive_()) return;
    if (props.getProperty("BUILD_STATUS") === "RUNNING") {
      var lastUpdate = new Date(
        props.getProperty("LAST_MODIFICATION_TIMESTAMP") || 0,
      ).getTime();
      var hasResumeTrigger = false;
      var triggers = ScriptApp.getProjectTriggers();
      for (var i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === RESUME_TRIGGER_HANDLER) {
          hasResumeTrigger = true;
          break;
        }
      }
      if (!hasResumeTrigger && (!Number.isFinite(lastUpdate) || Date.now() - lastUpdate > MAX_RUNTIME_MS + 60000)) {
        LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("scheduledDatabaseSync"), "[scheduledDatabaseSync] Resetting stale RUNNING build status after lease expiry.", { source: "migrated_structured_log", sourceLine: 344 }, "scheduledDatabaseSync");
        props.setProperty("BUILD_STATUS", "IDLE");
        props.setProperty("FORCE_REBUILD", "true");
        deleteBuildStateFile(true);
      }
    }
    if (props.getProperty("REBUILD_PENDING_AFTER_RUN") === "true") {
      props.deleteProperty("REBUILD_PENDING_AFTER_RUN");
      props.setProperty("FORCE_REBUILD", "true");
      deleteBuildStateFile(true);
    }
    shouldBuild = true;
  } catch (error) {
    LoggerService.log("ERROR", "TRIGGER", "Scheduled database sync preparation failed", {}, "scheduledDatabaseSync", error);
  } finally {
    lock.releaseLock();
  }
  if (shouldBuild) buildDatabaseCache();
}

function jsonResponse(payload) {
  if (payload === undefined) payload = {};
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function errorResponse(message, code, details) {
  var payload = {
    status: "error",
    code: code || "ERROR",
    message: String(message || "Error"),
  };
  if (details && typeof details === "object") {
    Object.keys(details).forEach(function (key) {
      payload[key] = details[key];
    });
  }
  return jsonResponse(payload);
}

function createBackendCorrelationId_() {
  var correlationId =
    typeof Utilities !== "undefined" &&
    Utilities &&
    typeof Utilities.getUuid === "function"
      ? String(Utilities.getUuid() || "")
      : "";
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      correlationId,
    )
  )
    return correlationId;
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 3) | 8).toString(16);
  });
}

function logBackendFailure_(
  handler,
  requestType,
  correlationId,
  error,
  durationMs,
  clientVersion,
  payload,
  requestLogState,
) {
  var safeHandler = /^[A-Za-z0-9_]{1,40}$/.test(String(handler || ""))
    ? String(handler)
    : "unknown";
  var safeRequestType = /^[A-Za-z0-9_]{1,64}$/.test(String(requestType || ""))
    ? String(requestType)
    : "unknown";
  var errorName =
    error && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(String(error.name || ""))
      ? String(error.name)
      : "Error";
  var reasonCode =
    error && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(String(error.code || ""))
      ? String(error.code)
      : "UNCLASSIFIED";
  var safeDurationMs = Number.isFinite(Number(durationMs))
    ? Math.max(0, Math.floor(Number(durationMs)))
    : -1;
  var safeClientVersion = /^[A-Za-z0-9._-]{1,80}$/.test(
    String(clientVersion || ""),
  )
    ? String(clientVersion)
    : "unknown";
  var requestEvent =
    requestLogState && requestLogState.event ? requestLogState.event : {};
  var queryParameters = {
    parameter: requestEvent.parameter || {},
    parameters: requestEvent.parameters || {},
  };
  var requestTypeForRecord =
    safeRequestType === "unknown"
      ? getCentralLogRequestType_(
          safeHandler === "doGet" ? "GET" : "POST",
          requestEvent,
        )
      : safeRequestType;
  if (requestLogState) {
    requestLogState.logged = true;
    requestLogState.correlationId = String(correlationId || "");
  }
  writeCentralWebAppLog_({
    severity: "ERROR",
    event: "request_error",
    outcome: "failure",
    method: safeHandler === "doGet" ? "GET" : "POST",
    handler: safeHandler,
    requestType: requestTypeForRecord,
    correlationId: String(
      correlationId || (requestLogState && requestLogState.correlationId) || "",
    ),
    durationMs: safeDurationMs,
    responseCode: reasonCode,
    clientVersion: safeClientVersion,
    errorName: errorName,
    errorMessage: sanitizeCentralLogText_(
      (error && error.message) || error || "Unknown error",
    ),
    stack: sanitizeCentralLogText_((error && error.stack) || ""),
    queryParameters: queryParameters,
    payload:
      payload === undefined && requestLogState && requestLogState.event
        ? requestLogState.event.postData &&
          requestLogState.event.postData.contents
        : payload,
  });
}

var MRH_CENTRAL_LOG_TIME_ZONE = "Asia/Manila";
var MRH_CENTRAL_LOG_TAB_HEADERS = [
  "Date",
  "Time",
  "Severity",
  "Request Type",
  "Method",
  "Correlation ID",
  "Duration ms",
  "Outcome",
  "Response Code",
  "Summary",
];
var MRH_CENTRAL_LOG_TAB_NAMES = ["REQUESTS", "SYNC", "PDF", "ERRORS"];
var MRH_CENTRAL_LOG_MAX_FIELD_LENGTH = 12000;
var MRH_CENTRAL_LOG_REDACTED = "[REDACTED]";

function sanitizeCentralLogText_(value) {
  return String(value || "")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[REDACTED]")
    .replace(
      /((?:id[_-]?token|access[_-]?token|refresh[_-]?token|token|password|secret|authorization|cookie|session(?:id|proof|public[_-]?key)?|public[_-]?key|credential)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .slice(0, MRH_CENTRAL_LOG_MAX_FIELD_LENGTH);
}

function escapeFormulaInjection_(value) {
  var text = String(value == null ? "" : value);
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? "'" + text : text;
}

function getCentralLogActiveUser_() {
  try {
    if (
      typeof Session === "undefined" ||
      !Session ||
      typeof Session.getActiveUser !== "function"
    )
      return "";
    var user = Session.getActiveUser();
    return user && typeof user.getEmail === "function"
      ? String(user.getEmail() || "").slice(0, 254)
      : "";
  } catch (error) {
    return "";
  }
}

function sanitizeCentralLogValue_(value, key, depth) {
  var normalizedKey = String(key || "").toLowerCase();
  if (
    /(?:token|password|secret|authorization|cookie|session|credential|requestid|eventid|pdf|binary|^data$)/i.test(
      normalizedKey,
    ) ||
    /^(?:email|verifiedaccountemail|firstname|lastname|middleinitial|fullname|name|activeuser)$/.test(
      normalizedKey,
    )
  )
    return MRH_CENTRAL_LOG_REDACTED;
  if (depth > 8) return "[MAX_DEPTH]";
  if (value === null || typeof value === "boolean" || typeof value === "number")
    return value;
  if (typeof value === "string")
    return sanitizeCentralLogText_(value).slice(
      0,
      MRH_CENTRAL_LOG_MAX_FIELD_LENGTH,
    );
  if (Array.isArray(value))
    return value.slice(0, 100).map(function (item) {
      return sanitizeCentralLogValue_(item, "", depth + 1);
    });
  if (typeof value === "object") {
    var safeObject = {};
    Object.keys(value)
      .slice(0, 100)
      .forEach(function (childKey) {
        safeObject[childKey] = sanitizeCentralLogValue_(
          value[childKey],
          childKey,
          depth + 1,
        );
      });
    return safeObject;
  }
  return String(value).slice(0, MRH_CENTRAL_LOG_MAX_FIELD_LENGTH);
}

function safeCentralLogPayload_(payload) {
  if (payload === undefined || payload === null) return "";
  var sanitized;
  if (typeof payload === "string") {
    try {
      sanitized = sanitizeCentralLogValue_(JSON.parse(payload), "", 0);
    } catch (error) {
      sanitized = "[REDACTED_INVALID_JSON_BODY length=" + payload.length + "]";
    }
  } else {
    sanitized = sanitizeCentralLogValue_(payload, "", 0);
  }
  var serialized = JSON.stringify(sanitized);
  if (serialized.length > MRH_CENTRAL_LOG_MAX_FIELD_LENGTH)
    return (
      serialized.slice(0, MRH_CENTRAL_LOG_MAX_FIELD_LENGTH) + "[TRUNCATED]"
    );
  return serialized;
}

function logStudentPortalActivity_(activity, details, persistToSheet) {
  details = details && typeof details === "object" ? details : {};
  var activityName = String(activity || "");
  if (!/^[A-Z][A-Z0-9_]{0,79}$/.test(activityName)) return false;
  var verifiedEmail = String(details.verifiedAccountEmail || "")
    .trim()
    .toLowerCase()
    .slice(0, 254);
  if (verifiedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verifiedEmail))
    verifiedEmail = "";
  var resourceId = String(details.resourceId || "");
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(resourceId)) resourceId = "";
  var issuanceReference = String(details.issuanceReference || "");
  if (!/^MRH-[0-9]{4}-[0-9]{4}$/.test(issuanceReference))
    issuanceReference = "";
  var auditEventId = String(details.auditEventId || "");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      auditEventId,
    )
  )
    auditEventId = "";
  var correlationId = String(details.correlationId || "");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      correlationId,
    )
  )
    correlationId = "";
  try {
    writeCentralWebAppLog_(
      {
        severity: details.outcome === "failure" ? "ERROR" : "INFO",
        event: "student_portal_activity",
        outcome: details.outcome || "success",
        method: "POST",
        requestType: String(details.requestType || "student_portal_activity"),
        correlationId: correlationId,
        activity: activityName,
        verifiedAccountEmail: verifiedEmail,
        resourceId: resourceId,
        resourceName: cleanText(details.resourceName, 200),
        resourceArea: cleanText(details.resourceArea, 40).toUpperCase(),
        course: cleanText(details.course, 160),
        year: cleanText(details.year, 40),
        semester: cleanText(details.semester, 40),
        category: cleanText(details.category, 40),
        issuanceReference: issuanceReference,
        auditEventId: auditEventId,
        responseCode: String(details.responseCode || "").slice(0, 64),
        detail: cleanText(details.detail, 80),
        queryParameters: {},
      },
      persistToSheet,
    );
    return true;
  } catch (error) {
    var safeError = sanitizeCentralLogText_(
      String((error && error.message) || error),
    );
    LoggerService.log(
      "ERROR",
      "BUSINESS_LOGIC",
      "Student portal activity log failed",
      { activity: activityName, safeError: safeError },
      "logStudentPortalActivity_",
      error,
    );
    return false;
  }
}

function writeCentralWebAppLog_(record, persistToSheet) {
  var payload = Object.assign(
    {
      timestamp: new Date().toISOString(),
      activeUser: getCentralLogActiveUser_(),
    },
    record || {},
  );
  payload.queryParameters = sanitizeCentralLogValue_(
    payload.queryParameters,
    "",
    0,
  );
  payload.payload = safeCentralLogPayload_(payload.payload);
  if (payload.activeUser)
    payload.activeUser = sanitizeCentralLogText_(payload.activeUser);
  if (payload.verifiedAccountEmail)
    payload.verifiedAccountEmail = sanitizeCentralLogText_(
      payload.verifiedAccountEmail,
    );
  if (payload.errorMessage)
    payload.errorMessage = sanitizeCentralLogText_(payload.errorMessage);
  if (payload.stack) payload.stack = sanitizeCentralLogText_(payload.stack);
  payload.activeUserAvailable = Boolean(payload.activeUser);
  // Emit the existing audit record through the canonical structured logger.
  // The Supabase sink below remains unchanged; this is the Cloud Logging view.
  LoggerService.log(
    payload.severity === "ERROR" ? "ERROR" : payload.severity === "WARN" ? "WARN" : "INFO",
    LoggerService.categoryForFunction_(payload.handler || payload.event || "writeCentralWebAppLog_"),
    String(payload.event || "Central web-app audit event"),
    payload,
    String(payload.handler || "writeCentralWebAppLog_"),
    null,
  );
  if (
    persistToSheet !== false &&
    shouldPersistCentralWebAppLogToSheet_(payload)
  )
    appendSupabaseWebsiteLog_(payload);
}

function isCriticalCentralWebAppLogEvent_(record) {
  if (!record || typeof record !== "object") return false;
  return (
    String(record.responseCode || "").toUpperCase() === "ACCOUNT_DENIED" ||
    String(record.activity || "").toUpperCase() === "ACCOUNT_DENIED" ||
    String(record.activity || "").toUpperCase() === "AUTO_RESTRICTED" ||
    String(record.event || "").toUpperCase() === "ACCOUNT_DENIED" ||
    String(record.event || "").toUpperCase() === "AUTO_RESTRICTED" ||
    String(record.event || "").toLowerCase() ===
      "reviewer_account_auto_restricted"
  );
}

function shouldPersistCentralWebAppLogToSheet_(record) {
  return Boolean(
    record &&
    (record.severity === "ERROR" || isCriticalCentralWebAppLogEvent_(record)),
  );
}

function getMRHConfiguredResourceId_(propertyName, productionDefault) {
  var properties = PropertiesService.getScriptProperties();
  var configuredId = String(properties.getProperty(propertyName) || "").trim();
  if (!configuredId) configuredId = String(productionDefault || "");
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(configuredId))
    throw new Error(propertyName + " is not configured with a valid production ID.");
  return configuredId;
}

function getMRHRootFolderId_() {
  return getMRHConfiguredResourceId_(
    "MRH_ROOT_FOLDER_ID",
    ROOT_FOLDER_ID_DEFAULT,
  );
}

function getMRHDatabaseFolderId_() {
  var databaseFolderId = getMRHConfiguredResourceId_(
    "MRH_DATABASE_FOLDER_ID",
    DATABASE_FOLDER_ID_DEFAULT,
  );
  if (databaseFolderId === getMRHRootFolderId_())
    throw new Error(
      "MRH_DATABASE_FOLDER_ID and MRH_ROOT_FOLDER_ID must identify different folders.",
    );
  return databaseFolderId;
}

function getMRHUuidSpreadsheetId_() {
  return getMRHConfiguredResourceId_(
    "MRH_UUID_SPREADSHEET_ID",
    UUID_SHEET_ID_DEFAULT,
  );
}

function getCentralLogRequestType_(method, event) {
  if (method === "GET") {
    var parameters = (event && event.parameter) || {};
    if (String(parameters.sync || "") === "1") return "sync_snapshot";
    if (parameters.subject) return "deck_summary";
    if (parameters.page !== undefined) return "deck_page";
    return "sync_status";
  }
  try {
    var payload = JSON.parse(
      String((event && event.postData && event.postData.contents) || "{}"),
    );
    var requestType = String((payload && payload.type) || "").trim();
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(requestType))
      return "invalid_request_type";
    return requestType;
  } catch (error) {
    return "invalid_json";
  }
}

function getCentralLogTabName_(record) {
  if (
    record.severity === "ERROR" ||
    record.outcome === "failure" ||
    isCriticalCentralWebAppLogEvent_(record)
  )
    return "ERRORS";
  if (
    /^(?:sync_snapshot|get_sync_status|get_cache_version|sync_status)$/.test(
      String(record.requestType || ""),
    )
  )
    return Number(record.durationMs) >= 2000 ? "SYNC" : "";
  if (/reviewer_pdf/i.test(String(record.requestType || ""))) return "PDF";
  return "REQUESTS";
}

function getCentralLogSummary_(record) {
  if (record.errorMessage)
    return sanitizeCentralLogText_(record.errorMessage).slice(0, 400);
  if (isCriticalCentralWebAppLogEvent_(record)) {
    var criticalEvent = String(
      record.activity || record.responseCode || record.event || "",
    ).slice(0, 80);
    return criticalEvent ? "securityEvent=" + criticalEvent : "";
  }
  var payload = record.payload;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch (error) {
      return "";
    }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return "";
  var summaryFields = [
    ["resourceArea", "area"],
    ["action", "action"],
    ["course", "course"],
    ["category", "category"],
    ["year", "year"],
    ["semester", "semester"],
  ];
  return summaryFields
    .map(function (field) {
      var value = payload[field[0]];
      if (value === null || value === undefined || typeof value === "object")
        return "";
      var safeValue = sanitizeCentralLogText_(String(value)).slice(0, 80);
      return safeValue ? field[1] + "=" + safeValue : "";
    })
    .filter(Boolean)
    .join("; ");
}

function appendSupabaseWebsiteLog_(record) {
  try {
    var normalized = record || {};
    if (!shouldPersistCentralWebAppLogToSheet_(normalized)) return false;
    var logGroup = getCentralLogTabName_(normalized);
    if (!logGroup) return false;
    var dateTime = formatCentralWebAppLogDateTime_(normalized.timestamp);
    var body = {
      log_group: logGroup,
      legacy_date: dateTime[0],
      legacy_time: dateTime[1],
      severity: String(normalized.severity || "INFO"),
      event: String(normalized.event || ""),
      outcome: String(normalized.outcome || ""),
      method: String(normalized.method || ""),
      handler: String(normalized.handler || ""),
      request_type: String(normalized.requestType || ""),
      correlation_id: String(normalized.correlationId || ""),
      duration_ms:
        normalized.durationMs === "" ||
        normalized.durationMs === null ||
        normalized.durationMs === undefined ||
        !Number.isFinite(Number(normalized.durationMs))
          ? null
          : Math.floor(Number(normalized.durationMs)),
      response_code: String(normalized.responseCode || ""),
      client_version: String(normalized.clientVersion || ""),
      error_name: String(normalized.errorName || ""),
      error_message: String(normalized.errorMessage || ""),
      stack: String(normalized.stack || ""),
      active_user_available: Boolean(normalized.activeUserAvailable),
      verified_account_email: String(normalized.verifiedAccountEmail || ""),
      activity: String(normalized.activity || ""),
      resource_id: String(normalized.resourceId || ""),
      resource_name: String(normalized.resourceName || ""),
      resource_area: String(normalized.resourceArea || ""),
      course: String(normalized.course || ""),
      year: String(normalized.year || ""),
      semester: String(normalized.semester || ""),
      category: String(normalized.category || ""),
      issuance_reference: String(normalized.issuanceReference || ""),
      audit_event_id: String(normalized.auditEventId || ""),
      detail: String(normalized.detail || ""),
      query_parameters:
        normalized.queryParameters &&
        typeof normalized.queryParameters === "object"
          ? normalized.queryParameters
          : {},
      payload_text:
        typeof normalized.payload === "string"
          ? normalized.payload
          : JSON.stringify(
              normalized.payload == null ? "" : normalized.payload,
            ),
      summary: getCentralLogSummary_(normalized),
      record: normalized,
    };
    var timestamp = new Date(normalized.timestamp || Date.now());
    if (Number.isFinite(timestamp.getTime()))
      body.logged_at = timestamp.toISOString();
    mrhSupabaseRequest_(
      MRH_SUPABASE_WEBSITE_LOGS_TABLE,
      "post",
      "select=id",
      body,
      "return=minimal",
    );
    return true;
  } catch (error) {
    var safeError = sanitizeCentralLogText_(
      String((error && error.message) || error),
    ).slice(0, 500);
    LoggerService.log(
      "ERROR",
      "API_CALL",
      "Supabase website log write failed",
      { safeError: safeError },
      "appendSupabaseWebsiteLog_",
      error,
    );
    return false;
  }
}
/**
 * Backward-compatible alias for callers in other project files and old setup scripts.
 * It writes to Supabase; it does not append to a Google Sheet. Retain until all
 * project-wide references can be checked, because Apps Script shares globals.
 */
function appendCentralWebAppLogToSheet_(record) {
  return appendSupabaseWebsiteLog_(record);
}

function formatCentralWebAppLogDateTime_(timestamp) {
  var date = new Date(timestamp || Date.now());
  if (!Number.isFinite(date.getTime())) return [String(timestamp || ""), ""];
  return [
    Utilities.formatDate(date, MRH_CENTRAL_LOG_TIME_ZONE, "yyyy-MM-dd"),
    Utilities.formatDate(date, MRH_CENTRAL_LOG_TIME_ZONE, "hh:mm:ss a"),
  ];
}

/**
 * Backward-compatible setup entry point. Despite its historical name, this
 * validates the Supabase website-log store; it does not create a Google Sheet.
 */
function initializeCentralWebAppLogSheet() {
  var config = getMRHSupabaseConfig_();
  if (!config.enabled)
    throw new Error(
      "Set MRH_SUPABASE_URL and MRH_SUPABASE_SECRET_KEY in Script Properties before setup.",
    );
  validateMRHSupabaseSchema_();
  return {
    storage: "supabase",
    projectUrl: config.url,
    table: MRH_SUPABASE_WEBSITE_LOGS_TABLE,
    logGroups: MRH_CENTRAL_LOG_TAB_NAMES.slice(),
  };
}
function getCentralLogResponseStatus_(response, requestType) {
  // These routes can return large JSON payloads (Base64 PDFs, complete decks,
  // or resource indexes). Calling TextOutput.getContent() only to classify a
  // log entry can force another full-body read/copy after the handler has
  // already built the response. PDF routes emit their own detailed timing log;
  // for other large routes, an unknown log outcome is preferable to that cost.
  if (
    [
      "get_reviewer_pdf_preview",
      "get_resource_preview",
      "deck_summary",
      "deck_page",
      "sync_snapshot",
      "get_deck",
      "get_reviewer_dashboard",
      "get_resource_dashboard",
      "list_public_resources",
    ].indexOf(String(requestType || "")) !== -1
  )
    return { outcome: "unknown", responseCode: "" };
  if (!response || typeof response.getContent !== "function")
    return { outcome: "success", responseCode: "" };
  var content;
  try {
    content = response.getContent();
  } catch (error) {
    return { outcome: "unknown", responseCode: "" };
  }
  if (typeof content !== "string")
    return { outcome: "unknown", responseCode: "" };
  if (content.length <= 1024) {
    try {
      var parsed = JSON.parse(content);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        ["error", "success", "ok"].indexOf(parsed.status) < 0
      )
        return { outcome: "unknown", responseCode: "" };
      return {
        outcome: parsed.status === "error" ? "failure" : "success",
        responseCode:
          parsed.status === "error"
            ? String(parsed.code || "").slice(0, 64)
            : "",
      };
    } catch (error) {
      var malformedErrorStatusMatch = /^\s*\{\s*"status"\s*:\s*"error"/.exec(
        content,
      );
      return malformedErrorStatusMatch
        ? { outcome: "failure", responseCode: "UNPARSEABLE_ERROR" }
        : { outcome: "unknown", responseCode: "" };
    }
  }
  var statusMatch =
    /^\s*\{\s*"status"\s*:\s*"(error|success|ok)"(?:\s*,|\s*\})/.exec(content);
  if (!statusMatch) return { outcome: "unknown", responseCode: "" };
  if (statusMatch[1] !== "error")
    return { outcome: "success", responseCode: "" };
  return {
    outcome: "failure",
    responseCode: "",
  };
}

function getCentralLogErrorCode_(response) {
  if (response && typeof response.code === "string")
    return response.code.slice(0, 64);
  var content = "";
  try {
    if (response && typeof response.getContent === "function")
      content = response.getContent();
    else if (response && typeof response.text === "string")
      content = response.text;
    var payload = JSON.parse(String(content || ""));
    return payload && typeof payload.code === "string"
      ? payload.code.slice(0, 64)
      : "AUTHORIZATION_FAILED";
  } catch (error) {
    return "AUTHORIZATION_FAILED";
  }
}

function logWebAppRequest_(method, event, startedAt, error, response) {
  var parameters = {
    parameter: event && event.parameter ? event.parameter : {},
    parameters: event && event.parameters ? event.parameters : {},
  };
  var postContents =
    method === "POST" && event && event.postData
      ? event.postData.contents
      : undefined;
  var requestType = getCentralLogRequestType_(method, event);
  var correlationId = "";
  if (typeof postContents === "string") {
    try {
      var parsedPayload = JSON.parse(postContents);
      if (parsedPayload && typeof parsedPayload === "object") {
        [parsedPayload.requestId, parsedPayload.eventId].some(
          function (candidate) {
            var candidateCorrelationId = String(candidate || "");
            if (
              /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                candidateCorrelationId,
              )
            ) {
              correlationId = candidateCorrelationId.toLowerCase();
              return true;
            }
            return false;
          },
        );
      }
    } catch (parseError) {
      requestType = "invalid_json";
    }
  } else if (method === "GET") {
    var queryCorrelationId = String(
      (event && event.parameter && event.parameter.requestId) || "",
    );
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        queryCorrelationId,
      )
    )
      correlationId = queryCorrelationId.toLowerCase();
  }
  if (!correlationId) correlationId = createBackendCorrelationId_();
  var record = {
    severity: error ? "ERROR" : "INFO",
    event: error ? "request_error" : "request_access",
    outcome: error ? "failure" : "unknown",
    method: method,
    requestType: requestType,
    correlationId: correlationId,
    queryParameters: sanitizeCentralLogValue_(parameters, "", 0),
    payload: postContents,
    durationMs: Math.max(0, Date.now() - startedAt),
  };
  if (!error) {
    var responseStatus = getCentralLogResponseStatus_(response, requestType);
    record.outcome = responseStatus.outcome;
    record.responseCode = responseStatus.responseCode;
  }
  if (error) {
    record.errorMessage = sanitizeCentralLogText_(error.message || error);
    record.stack = sanitizeCentralLogText_(error.stack || "");
  }
  writeCentralWebAppLog_(record, true);
}

function executeLoggedWebAppRequest_(method, event, handler) {
  var startedAt = Date.now();
  var logged = false;
  var requestLogState = {
    event: event || {},
    method: method,
    startedAt: startedAt,
    logged: false,
  };
  var wrappedEvent = Object.assign({}, event || {}, {
    __mrhCentralLogState: requestLogState,
  });
  var logOnce = function (error) {
    if (logged) return;
    logged = true;
    if (requestLogState.logged) return;
    requestLogState.logged = true;
    logWebAppRequest_(
      method,
      event,
      startedAt,
      error,
      requestLogState.response,
    );
  };
  try {
    var response = handler(wrappedEvent);
    requestLogState.response = response;
    if (response && typeof response.then === "function")
      return response.then(
        function (result) {
          requestLogState.response = result;
          logOnce(null);
          return result;
        },
        function (error) {
          logOnce(error);
          throw error;
        },
      );
    logOnce(null);
    return response;
  } catch (error) {
    logOnce(error);
    throw error;
  }
}

function logBackendContention_(
  requestType,
  correlationId,
  reasonCode,
  clientVersion,
  durationMs,
) {
  var safeRequestType = /^[A-Za-z0-9_]{1,64}$/.test(String(requestType || ""))
    ? String(requestType)
    : "unknown";
  var safeReasonCode = /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(
    String(reasonCode || ""),
  )
    ? String(reasonCode)
    : "LOCK_CONTENTION";
  var safeCorrelationId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(correlationId || ""),
    )
      ? String(correlationId).toLowerCase()
      : createBackendCorrelationId_();
  var safeClientVersion = /^[A-Za-z0-9._-]{1,80}$/.test(
    String(clientVersion || ""),
  )
    ? String(clientVersion)
    : "unknown";
  var safeDurationMs = Number.isFinite(Number(durationMs))
    ? Math.max(0, Math.floor(Number(durationMs)))
    : -1;
  LoggerService.log("INFO", mrhLoggerCategoryForFunction_("logBackendContention_"), "[MRH] contention requestType=" +
      safeRequestType +
      " correlationId=" +
      safeCorrelationId +
      " timestamp=" +
      new Date().toISOString() +
      " durationMs=" +
      safeDurationMs +
      " clientVersion=" +
      safeClientVersion +
      " responseCode=" +
      safeReasonCode +
      " reasonCode=" +
      safeReasonCode, { source: "migrated_structured_log", sourceLine: 1203 }, "logBackendContention_");
}

function getResourcePortalRootFolderId_() {
  return getMRHConfiguredResourceId_(
    "MRH_RESOURCE_PORTAL_ROOT_FOLDER_ID",
    RESOURCE_PORTAL_ROOT_FOLDER_ID_DEFAULT,
  );
}
function getResourceDashboardIndexFolderId_() {
  return getMRHConfiguredResourceId_(
    "MRH_RESOURCE_DASHBOARD_INDEX_FOLDER_ID",
    RESOURCE_DASHBOARD_INDEX_FOLDER_ID_DEFAULT,
  );
}
var RESOURCE_DASHBOARD_INDEX_FILES = {
  MODULES: "modules_combined.json",
  REVIEWERS: "reviewers_combined.json",
  SYLLABUS: "syllabus.json",
};
var MRH_REVIEWER_PDF_INDEX_FILE_ID_PROPERTY =
  "MRH_REVIEWER_PDF_INDEX_FILE_ID";
var MRH_REVIEWER_PDF_INDEX_ENTRY_CACHE_TTL_SECONDS_ = 300;
var RESOURCE_DASHBOARD_CATEGORIES = {
  MODULES: ["PRELIMS", "MIDTERMS", "FINALS"],
  REVIEWERS: ["PRELIMS", "MIDTERMS", "FINALS"],
  SYLLABUS: ["SYLLABUS"],
};
var RESOURCE_PORTAL_PRIVATE_FOLDER_PATTERN = /^REVIEWERS v\d{2}\.\d{2}\.\d{2}$/;
var RESOURCE_PORTAL_MAX_ITEMS = 1000;
var RESOURCE_PORTAL_MAX_PREVIEW_BYTES = 32 * 1024 * 1024;
var REVIEWER_PDF_MAX_SOURCE_BYTES_ = 16 * 1024 * 1024;
var REVIEWER_PDF_MAX_RESPONSE_BYTES_ = 46 * 1024 * 1024;
var REVIEWER_PDF_SUSPICIOUS_RESOURCE_WINDOW_MS_ = 10 * 60 * 1000;
var REVIEWER_PDF_SUSPICIOUS_RESOURCE_LIMIT_ = 5;
var MRH_REVIEWER_ACL_PRESERVE_PRINCIPALS_PROPERTY =
  "MRH_REVIEWER_ACL_PRESERVE_PRINCIPALS";
var RESOURCE_PORTAL_LISTING_CACHE_TTL_SECONDS = 30;
var RESOURCE_PORTAL_MAX_CACHED_LISTING_CHARS = 90000;

var MRH_ACCOUNTS_SHEET_NAME = "ACCOUNTS";
var MRH_LEGACY_ACCOUNTS_SHEET_NAME = "Accounts";
var MRH_SIGN_IN_SHEET_NAME = "SIGN-IN";
var MRH_MODULE_LOG_SHEET_NAME = "MODULES";
var MRH_ACCOUNTS_HEADERS = [
  "Email",
  "Last Name",
  "First Name",
  "Middle Initial",
  "Active",
  "Date",
  "Time",
  "Last Access Date",
  "Last Access Time",
  "Permanent PDF Issuance ID",
];
var MRH_OBSOLETE_ACCOUNT_HEADERS = [
  "Last PDF Issuance ID",
  "Last PDF Source File ID",
];

// Legacy header/scope constants are intentionally retained as compatibility
// exports for other project files; the current Supabase path does not consume them.


var MRH_REVIEWER_ENROLLMENT_AUDIT_PREFIX = "MRH_REVIEWER_ENROLLMENT_AUDIT_v1_";
var MRH_REVIEWER_SIGNOUT_AUDIT_PREFIX = "MRH_REVIEWER_SIGNOUT_AUDIT_v1_";
var MRH_REVIEWER_ACCESS_NOTIFICATION_RECIPIENT_PROPERTY =
  "MRH_REVIEWER_ACCESS_NOTIFICATION_RECIPIENT";
// Supabase row IDs are not comparable to the legacy Sheets row-number cursor.
var MRH_REVIEWER_ACCESS_NOTIFICATION_CURSOR_PROPERTY =
  "MRH_REVIEWER_ACCESS_NOTIFICATION_CURSOR_SUPABASE_v1";
var MRH_REVIEWER_ACCESS_NOTIFICATION_BASELINE_PROPERTY =
  "MRH_REVIEWER_ACCESS_NOTIFICATION_BASELINE_SUPABASE_v1";
var MRH_REVIEWER_ACCESS_NOTIFICATION_BATCH_SIZE = 20;



var MRH_TOKEN_CACHE_MAX_TTL_SECONDS = 300;
var MRH_RESOURCE_DASHBOARD_CACHE_TTL_SECONDS = 30;
var MRH_RESOURCE_DASHBOARD_VERSION_CACHE_TTL_SECONDS = CACHE_TTL_SECONDS;
var MRH_REVIEWER_DASHBOARD_VERSION_CACHE_TTL_SECONDS = CACHE_TTL_SECONDS;
var MRH_ACCOUNT_CACHE_TTL_SECONDS = 30;
var MRH_ACCOUNT_CACHE_GENERATION_PROPERTY = "MRH_ACCOUNT_CACHE_GENERATION";
var MRH_SPREADSHEET_TIME_ZONE = "Asia/Manila";
var MRH_LOG_DEDUPE_TTL_SECONDS = 21600;
// Fresh event IDs are generated inside the request and the audit table's unique
// constraint is the concurrency guard. Do not serialize these audit writes behind
// the project-wide script lock; retain the lock for other legacy audit callers.
var MRH_PDF_AUDIT_SKIP_SCRIPT_LOCK_ = true;

function getResourceDashboardFileId(linkUrl) {
  var value = String(linkUrl || "").trim();
  if (!/^https:\/\/(?:drive|docs)\.google\.com(?:\/|$)/i.test(value)) return "";
  var pathMatch = /\/(?:d|folders)\/([^/?#]+)/i.exec(value);
  var queryMatch = /[?&]id=([^&#]+)/i.exec(value);
  var encodedId = pathMatch ? pathMatch[1] : queryMatch ? queryMatch[1] : "";
  if (!encodedId) return "";
  var fileId;
  try {
    fileId = decodeURIComponent(encodedId);
  } catch (error) {
    return "";
  }
  return /^[A-Za-z0-9_-]{10,}$/.test(fileId) ? fileId : "";
}

function getResourceDashboardCombinedIndex(fileName, file) {
  var parsed;
  try {
    parsed = JSON.parse(file.getBlob().getDataAsString());
  } catch (error) {
    var invalidJsonError = new Error(
      "Resource dashboard index is invalid JSON (" +
        fileName +
        "): " +
        error.message,
    );
    invalidJsonError.code = "RESOURCE_INDEX_INVALID_JSON";
    throw invalidJsonError;
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    typeof parsed.b !== "string" ||
    !parsed.d ||
    typeof parsed.d !== "object" ||
    Array.isArray(parsed.d)
  ) {
    var unsupportedFormatError = new Error(
      "Resource dashboard index has an unsupported format: " + fileName,
    );
    unsupportedFormatError.code = "RESOURCE_INDEX_UNSUPPORTED_FORMAT";
    throw unsupportedFormatError;
  }
  return parsed;
}

function getResourceDashboardExportUrl(item, base, fileName) {
  var rawUrl = String(
    Array.isArray(item)
      ? item[1] || ""
      : item && Object.prototype.hasOwnProperty.call(item, "u")
        ? item.u || ""
        : item && item.url
          ? item.url
          : "",
  ).trim();
  var url = /^https:\/\//i.test(rawUrl)
    ? rawUrl
    : /^[A-Za-z0-9_-]{10,}$/.test(rawUrl)
      ? base + encodeURIComponent(rawUrl)
      : "";
  if (!url || !getResourceDashboardFileId(url)) {
    var invalidLinkError = new Error(
      "Resource dashboard index contains an invalid Drive link: " + fileName,
    );
    invalidLinkError.code = "RESOURCE_INDEX_INVALID_LINK";
    throw invalidLinkError;
  }
  return url;
}

function getResourceDashboardExportMimeType(item, fileName, tabName) {
  var type = "";
  if (Array.isArray(item)) {
    if (tabName === "MODULES") {
      type = "1";
    } else {
      var tuplePriority = Number(item[3]);
      type = { 4: "pdf", 3: "gdoc", 2: "docx", 1: "doc" }[tuplePriority] || "";
    }
  } else {
    type = String(
      item && Object.prototype.hasOwnProperty.call(item, "t")
        ? item.t
        : item && item.type != null
          ? item.type
          : "",
    ).toLowerCase();
  }
  if (type === "1" || type === "folder") {
    return "application/vnd.google-apps.folder";
  }
  if (type === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (type === "gdoc") {
    return "application/vnd.google-apps.document";
  }
  if (type === "pdf" || /\.pdf$/i.test(fileName)) return "application/pdf";
  return "";
}

function buildResourceDashboardTab(tabName, index) {
  var fileName = RESOURCE_DASHBOARD_INDEX_FILES[tabName];
  var categories = RESOURCE_DASHBOARD_CATEGORIES[tabName];
  if (!fileName || !categories) {
    throw new Error("Unknown resource dashboard index: " + tabName);
  }
  var rowsByKey = Object.create(null);
  var years = Object.keys(index.d)
    .filter(function (year) {
      return /^\d+\.\d+$/.test(year);
    })
    .sort(function (left, right) {
      var leftParts = left.split(".").map(Number);
      var rightParts = right.split(".").map(Number);
      return (
        leftParts[0] - rightParts[0] ||
        leftParts[1] - rightParts[1] ||
        left.localeCompare(right)
      );
    });

  years.forEach(function (year) {
    var yearData = index.d[year];
    if (!yearData || typeof yearData !== "object" || Array.isArray(yearData)) {
      throw new Error(
        "Resource dashboard index has invalid term data: " +
          fileName +
          " (" +
          year +
          ")",
      );
    }
    categories.forEach(function (category) {
      var courseMap = yearData[category];
      if (courseMap == null) return;
      if (typeof courseMap !== "object" || Array.isArray(courseMap)) {
        throw new Error(
          "Resource dashboard index has invalid category data: " +
            fileName +
            " (" +
            year +
            "/" +
            category +
            ")",
        );
      }
      Object.keys(courseMap).forEach(function (course) {
        var item = courseMap[course];
        if (!item || typeof item !== "object") {
          throw new Error(
            "Resource dashboard index has an invalid resource: " +
              fileName +
              " (" +
              year +
              "/" +
              category +
              "/" +
              course +
              ")",
          );
        }
        var rowKey = year + "\u0000" + course;
        if (!Object.prototype.hasOwnProperty.call(rowsByKey, rowKey)) {
          rowsByKey[rowKey] = {
            year: year,
            course: course,
            resources: Object.create(null),
          };
        }
        var title = String(
          Array.isArray(item)
            ? item[0] || course
            : item.n || item.name || course,
        ).trim();
        rowsByKey[rowKey].resources[category] = {
          title: title,
          url: getResourceDashboardExportUrl(item, index.b, fileName),
          mimeType: getResourceDashboardExportMimeType(item, title, tabName),
        };
      });
    });
  });

  var columns = ["Year", "Course"].concat(
    categories.map(function (category) {
      return category === "SYLLABUS" ? "COURSE SYLLABUS" : category;
    }),
  );
  var rows = Object.keys(rowsByKey)
    .map(function (key) {
      return rowsByKey[key];
    })
    .sort(function (left, right) {
      var yearComparison = left.year.localeCompare(right.year, undefined, {
        numeric: true,
      });
      return (
        yearComparison ||
        left.course.localeCompare(right.course, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );
    });
  var values = [];
  var links = [];
  var linkTitles = [];
  var linkTypes = [];
  rows.forEach(function (row) {
    var rowValues = [row.year, row.course];
    var rowLinks = ["", ""];
    var rowTitles = ["", ""];
    var rowTypes = ["", ""];
    categories.forEach(function (category) {
      var resource = row.resources[category];
      rowValues.push(resource ? resource.title : "");
      rowLinks.push(resource ? resource.url : "");
      rowTitles.push(resource ? resource.title : "");
      rowTypes.push(resource ? resource.mimeType : "");
    });
    values.push(rowValues);
    links.push(rowLinks);
    linkTitles.push(rowTitles);
    linkTypes.push(rowTypes);
  });

  return {
    columns: columns,
    rows: values,
    links: links,
    linkTitles: linkTitles,
    linkTypes: linkTypes,
    truncated: false,
  };
}

function handleGetResourceDashboardRequest(cachedVersion) {
  var dashboardCache = null;
  try {
    dashboardCache = CacheService.getScriptCache();
    var latestDashboard = dashboardCache.get(
      "mrh_resource_dashboard_latest_v1",
    );
    if (latestDashboard) {
      var parsedLatestDashboard = JSON.parse(latestDashboard);
      if (
        parsedLatestDashboard &&
        parsedLatestDashboard.status === "success" &&
        typeof parsedLatestDashboard.version === "string" &&
        parsedLatestDashboard.tabs &&
        parsedLatestDashboard.tabs.MODULES &&
        parsedLatestDashboard.tabs.SYLLABUS
      ) {
        if (
          cachedVersion &&
          String(cachedVersion) === parsedLatestDashboard.version
        )
          return jsonResponse({
            status: "success",
            notModified: true,
            version: parsedLatestDashboard.version,
          });
        return jsonResponse(parsedLatestDashboard);
      }
      dashboardCache.remove("mrh_resource_dashboard_latest_v1");
    }
  } catch (cacheError) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("handleGetResourceDashboardRequest"), "[handleGetResourceDashboardRequest] Latest cache read failed.", { source: "migrated_structured_log", sourceLine: 1658 }, "handleGetResourceDashboardRequest");
  }
  var folder = mrhLoggedDriveGetFolderById_(getResourceDashboardIndexFolderId_());
  var indexFiles = {};
  var indexFileNames = Object.keys(RESOURCE_DASHBOARD_INDEX_FILES)
    .map(function (name) {
      return RESOURCE_DASHBOARD_INDEX_FILES[name];
    })
    .filter(function (fileName, index, names) {
      return names.indexOf(fileName) === index;
    });
  var versionParts = [];
  indexFileNames.forEach(function (fileName) {
    var files = folder.getFilesByName(fileName);
    if (!files.hasNext()) {
      throw new Error("Resource dashboard index is missing: " + fileName);
    }
    var file = files.next();
    indexFiles[fileName] = file;
    versionParts.push(
      fileName +
        ":" +
        String(file.getId()) +
        ":" +
        String(file.getLastUpdated().getTime()),
    );
  });
  versionParts.push("reviewers-locked-v1");
  var version = versionParts.join("|");
  if (cachedVersion && String(cachedVersion) === version) {
    return jsonResponse({
      status: "success",
      notModified: true,
      version: version,
    });
  }

  var dashboardCacheKey = "mrh_resource_dashboard_v1_" + sha256Hex(version);
  try {
    if (!dashboardCache) dashboardCache = CacheService.getScriptCache();
    var cachedDashboard = dashboardCache.get(dashboardCacheKey);
    if (cachedDashboard) {
      var parsedDashboard = JSON.parse(cachedDashboard);
      if (
        parsedDashboard &&
        parsedDashboard.status === "success" &&
        parsedDashboard.version === version &&
        parsedDashboard.tabs &&
        parsedDashboard.tabs.MODULES &&
        parsedDashboard.tabs.SYLLABUS
      )
        return jsonResponse(parsedDashboard);
      dashboardCache.remove(dashboardCacheKey);
    }
  } catch (cacheError) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("handleGetResourceDashboardRequest"), "[handleGetResourceDashboardRequest] Dashboard cache read failed.", { source: "migrated_structured_log", sourceLine: 1713 }, "handleGetResourceDashboardRequest");
  }

  var tabs = {};
  // The resource dashboard intentionally exposes an empty REVIEWERS tab because
  // Reviewer PDFs are served through the protected Reviewer dashboard. Keep the
  // Reviewer index in versionParts above so updates still invalidate the public
  // dashboard version, but do not download/parse its full JSON on a cache miss.
  ["MODULES", "SYLLABUS"].forEach(function (name) {
    var fileName = RESOURCE_DASHBOARD_INDEX_FILES[name];
    var index = getResourceDashboardCombinedIndex(
      fileName,
      indexFiles[fileName],
    );
    tabs[name] = buildResourceDashboardTab(name, index);
  });
  tabs.REVIEWERS = {
    columns: [],
    rows: [],
    links: [],
    linkTitles: [],
    linkTypes: [],
    truncated: false,
  };

  var dashboardResponse = {
    status: "success",
    version: version,
    tabs: tabs,
  };
  var dashboardJson = JSON.stringify(dashboardResponse);
  if (dashboardJson.length <= 90000) {
    try {
      if (!dashboardCache) dashboardCache = CacheService.getScriptCache();
      dashboardCache.put(
        dashboardCacheKey,
        dashboardJson,
        MRH_RESOURCE_DASHBOARD_VERSION_CACHE_TTL_SECONDS,
      );
      dashboardCache.put(
        "mrh_resource_dashboard_latest_v1",
        dashboardJson,
        MRH_RESOURCE_DASHBOARD_CACHE_TTL_SECONDS,
      );
    } catch (cacheError) {
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("handleGetResourceDashboardRequest"), "[handleGetResourceDashboardRequest] Dashboard cache write failed.", { source: "migrated_structured_log", sourceLine: 1760 }, "handleGetResourceDashboardRequest");
    }
  }
  return ContentService.createTextOutput(dashboardJson).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function getReviewerAuthorizationConfig_() {
  if (!MRH_EXECUTION_CONFIG_MEMO_.reviewerAuthorization)
    MRH_EXECUTION_CONFIG_MEMO_.reviewerAuthorization =
      getReviewerAuthorizationConfigUncached_();
  return Object.assign({}, MRH_EXECUTION_CONFIG_MEMO_.reviewerAuthorization);
}

function getReviewerAuthorizationConfigUncached_() {
  var properties = getScriptProps();
  var clientId = String(
    properties.getProperty("MRH_GOOGLE_OAUTH_CLIENT_ID") || "",
  ).trim();
  var validClientId =
    clientId.length <= 256 &&
    /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId);
  var supabase = getMRHSupabaseConfig_();
  return {
    clientId: validClientId ? clientId : "",
    storeId: supabase.storeId,
    supabaseUrl: supabase.url,
    enabled: validClientId && supabase.enabled,
  };
}
function handleGetReviewerAuthorizationConfigRequest() {
  var config = getReviewerAuthorizationConfig_();
  return jsonResponse({
    status: "success",
    enabled: config.enabled,
    clientId: config.clientId,
  });
}

function initializeMRHAccountsSpreadsheet() {
  // Kept under its original name so the existing Apps Script setup workflow still works.
  var config = getMRHSupabaseConfig_();
  if (!config.enabled)
    throw new Error(
      "Set MRH_SUPABASE_URL and MRH_SUPABASE_SECRET_KEY in Script Properties before setup.",
    );
  validateMRHSupabaseSchema_();
  return {
    status: "success",
    storage: "supabase",
    projectUrl: config.url,
    tables: [
      MRH_SUPABASE_ACCOUNTS_TABLE,
      MRH_SUPABASE_ACTIVITY_TABLE,
      MRH_SUPABASE_WEBSITE_LOGS_TABLE,
    ],
  };
}
function normalizeMRHAccountStatus_(value, sourceName, rowIdentifier) {
  var status = String(value == null ? "" : value)
    .trim()
    .toUpperCase();
  if (["TRUE", "YES", "1"].indexOf(status) !== -1) return "TRUE";
  if (["FALSE", "NO", "0", ""].indexOf(status) !== -1) return "FALSE";
  if (status === "DENIED" || status === "RESTRICTED") return status;
  throw new Error(
    "Invalid account Active status in " +
      String(sourceName || "Supabase") +
      " for " +
      String(rowIdentifier || "the selected account") +
      ". Use FALSE, TRUE, DENIED, or RESTRICTED.",
  );
}

function mapSupabaseMRHAccount_(row) {
  if (!row) return null;
  var email = String(row.email || "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Supabase returned an invalid account email.");
  var active = normalizeMRHAccountStatus_(
    row.active,
    MRH_SUPABASE_ACCOUNTS_TABLE,
    email,
  );
  return {
    email: email,
    lastName: cleanText(row.last_name, 100),
    firstName: cleanText(row.first_name, 100),
    middleInitial: cleanText(row.middle_initial, 10),
    rawAccountStatus: String(row.active == null ? "" : row.active).trim(),
    date: cleanText(row.created_date, 40),
    time: cleanText(row.created_time, 40),
    lastAccessDate: cleanText(row.last_access_date, 40),
    lastAccessTime: cleanText(row.last_access_time, 40),
    permanentPdfIssuanceId: cleanText(row.permanent_pdf_issuance_id, 40),
    accountStatus: active,
  };
}

function findMRHAccount_(email, bypassCache) {
  var normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  if (!normalizedEmail) return null;
  var config = getReviewerAuthorizationConfig_();
  if (!config.enabled)
    throw new Error("Reviewer account authorization is not configured.");
  var cacheKey =
    "mrh_account_v3_" +
    getMRHAccountCacheGeneration_() +
    "_" +
    sha256Hex(config.storeId + ":" + normalizedEmail);
  var cache = null;
  if (!bypassCache) {
    try {
      cache = CacheService.getScriptCache();
      var cached = cache.get(cacheKey);
      if (cached) {
        var parsedCacheValue = JSON.parse(cached);
        var hasCacheExpiry =
          parsedCacheValue &&
          Object.prototype.hasOwnProperty.call(
            parsedCacheValue,
            "_mrhCacheExpiresAt",
          );
        if (
          hasCacheExpiry &&
          (!Number.isFinite(Number(parsedCacheValue._mrhCacheExpiresAt)) ||
            Number(parsedCacheValue._mrhCacheExpiresAt) <= Date.now())
        ) {
          cache.remove(cacheKey);
          parsedCacheValue = null;
        }
        if (parsedCacheValue) {
          var parsed = Object.assign({}, parsedCacheValue);
          // Hide cache bookkeeping from application callers and support cache
          // entries written by older versions that did not include this field.
          delete parsed._mrhCacheExpiresAt;
          if (parsed && parsed.notFound === true) return null;
          if (
            parsed &&
            parsed.email === normalizedEmail &&
            ["TRUE", "FALSE", "DENIED", "RESTRICTED"].indexOf(
              parsed.accountStatus,
            ) >= 0
          )
            return parsed;
          cache.remove(cacheKey);
        } else {
          cache.remove(cacheKey);
        }
      }
    } catch (cacheError) {
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("findMRHAccount_"), "[findMRHAccount_] Supabase account cache read failed.", { source: "migrated_structured_log", sourceLine: 1918 }, "findMRHAccount_");
    }
  }
  var matches = mrhSupabaseSelect_(
    MRH_SUPABASE_ACCOUNTS_TABLE,
    "select=email,last_name,first_name,middle_initial,active,created_date,created_time,last_access_date,last_access_time,permanent_pdf_issuance_id&email=eq." +
      encodeMRHSupabaseFilterValue_(normalizedEmail) +
      "&limit=2",
  );
  if (matches.length > 1)
    throw new Error(
      "Duplicate account rows exist for " +
        normalizedEmail +
        ". Resolve them in Supabase.",
    );
  var account = matches.length ? mapSupabaseMRHAccount_(matches[0]) : null;
  cacheMRHAccountResult_(cache, cacheKey, account);
  return account;
}

function cacheMRHAccountResult_(cache, cacheKey, account) {
  try {
    if (!cache) cache = CacheService.getScriptCache();
    var cacheValue = Object.assign({}, account || { notFound: true });
    // Preserve the original expiry if activity fields are refreshed in place.
    cacheValue._mrhCacheExpiresAt =
      Date.now() + MRH_ACCOUNT_CACHE_TTL_SECONDS * 1000;
    cache.put(
      cacheKey,
      JSON.stringify(cacheValue),
      MRH_ACCOUNT_CACHE_TTL_SECONDS,
    );
  } catch (cacheError) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("cacheMRHAccountResult_"), "[findMRHAccount_] Supabase account cache write failed.", { source: "migrated_structured_log", sourceLine: 1951 }, "cacheMRHAccountResult_");
  }
}

function invalidateMRHAccountCache_(storeId, email) {
  try {
    CacheService.getScriptCache().remove(
      "mrh_account_v3_" +
        getMRHAccountCacheGeneration_() +
        "_" +
        sha256Hex(
          String(storeId || "") +
            ":" +
            String(email || "")
              .trim()
              .toLowerCase(),
        ),
    );
  } catch (cacheError) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("invalidateMRHAccountCache_"), "[invalidateMRHAccountCache_] Account cache invalidation failed.", { source: "migrated_structured_log", sourceLine: 1970 }, "invalidateMRHAccountCache_");
  }
}

function refreshMRHAccountActivityCache_(
  storeId,
  email,
  lastAccess,
  issuanceReference,
) {
  var normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
    !Array.isArray(lastAccess) ||
    lastAccess.length < 2
  )
    return false;
  try {
    var cache = CacheService.getScriptCache();
    var cacheKey =
      "mrh_account_v3_" +
      getMRHAccountCacheGeneration_() +
      "_" +
      sha256Hex(String(storeId || "") + ":" + normalizedEmail);
    var cached = cache.get(cacheKey);
    if (!cached) return false;
    var account = JSON.parse(cached);
    var expiresAt = Number(account && account._mrhCacheExpiresAt);
    // Do not refresh legacy entries without an expiry marker: let their original
    // CacheService TTL run out rather than extending authorization-data freshness.
    if (!Number.isFinite(expiresAt)) return false;
    var now = Date.now();
    var remainingTtlSeconds = Math.floor((expiresAt - now) / 1000);
    if (remainingTtlSeconds < 1) {
      cache.remove(cacheKey);
      return false;
    }
    if (
      !account ||
      account.email !== normalizedEmail ||
      ["TRUE", "FALSE", "DENIED", "RESTRICTED"].indexOf(
        account.accountStatus,
      ) < 0
    ) {
      cache.remove(cacheKey);
      return false;
    }
    account.lastAccessDate = String(lastAccess[0] || "");
    account.lastAccessTime = String(lastAccess[1] || "");
    if (issuanceReference)
      account.permanentPdfIssuanceId = String(issuanceReference);
    cache.put(cacheKey, JSON.stringify(account), remainingTtlSeconds);
    return true;
  } catch (cacheError) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("refreshMRHAccountActivityCache_"), "[refreshMRHAccountActivityCache_] Account cache refresh failed.", { source: "migrated_structured_log", sourceLine: 2028 }, "refreshMRHAccountActivityCache_");
    return false;
  }
}

function getMRHAccountCacheGeneration_() {
  return String(
    getScriptProps().getProperty(MRH_ACCOUNT_CACHE_GENERATION_PROPERTY) || "0",
  );
}

function invalidateMRHAccountCacheAll_() {
  getScriptProps().setProperty(
    MRH_ACCOUNT_CACHE_GENERATION_PROPERTY,
    Utilities.getUuid(),
  );
}

function mrhAccountsEdited(event) {
  // Legacy Google Sheets edit trigger. Account records now live in Supabase; this intentionally does nothing.
}

function writeMRHAccountFields_(email, values, allowCreate) {
  var normalizedEmail = String((values && values.Email) || email || "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
    throw new Error("A valid account email is required.");
  var fieldMap = {
    Email: "email",
    "Last Name": "last_name",
    "First Name": "first_name",
    "Middle Initial": "middle_initial",
    Active: "active",
    Date: "created_date",
    Time: "created_time",
    "Last Access Date": "last_access_date",
    "Last Access Time": "last_access_time",
    "Permanent PDF Issuance ID": "permanent_pdf_issuance_id",
  };
  var payload = {
    email: normalizedEmail,
    updated_at: new Date().toISOString(),
  };
  Object.keys(values || {}).forEach(function (header) {
    var column = fieldMap[header];
    if (!column) return;
    var value = values[header];
    if (column === "email") value = normalizedEmail;
    else if (column === "active")
      value = normalizeMRHAccountStatus_(
        value,
        MRH_SUPABASE_ACCOUNTS_TABLE,
        normalizedEmail,
      );
    else if (typeof value === "string")
      value = cleanText(value, column === "middle_initial" ? 10 : 5000);
    payload[column] = value;
  });
  var selectedColumns =
    "email,last_name,first_name,middle_initial,active,created_date,created_time,last_access_date,last_access_time,permanent_pdf_issuance_id";
  var query =
    "email=eq." +
    encodeMRHSupabaseFilterValue_(normalizedEmail) +
    "&select=" +
    selectedColumns;
  var result;
  if (allowCreate === true) {
    query = "on_conflict=email&select=" + selectedColumns;
    // A concurrent create must never overwrite an account/status that appeared
    // after the caller's lookup. Treat that conflict as a retryable create failure.
    result = mrhSupabaseRequest_(
      MRH_SUPABASE_ACCOUNTS_TABLE,
      "post",
      query,
      payload,
      "resolution=ignore-duplicates,return=representation",
    );
  } else {
    // Updates must not upsert: if the account was removed concurrently, do not
    // recreate a partial account while setting a status or PDF issuance ID.
    result = mrhSupabaseRequest_(
      MRH_SUPABASE_ACCOUNTS_TABLE,
      "patch",
      query,
      payload,
      "return=representation",
    );
  }
  var resultRows = mrhSupabaseRows_(result);
  if (resultRows.length !== 1)
    throw new Error(
      allowCreate === true
        ? "The reviewer account could not be saved to Supabase."
        : "The existing reviewer account could not be updated in Supabase.",
    );
  invalidateMRHAccountCache_(getMRHSupabaseConfig_().storeId, normalizedEmail);
  return mapSupabaseMRHAccount_(resultRows[0]);
}

function setupReviewerAccessRequestNotifications() {
  var config = getReviewerAuthorizationConfig_();
  if (!config.enabled)
    throw new Error("Reviewer account authorization is not configured.");
  var recipient = String(Session.getEffectiveUser().getEmail() || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
    throw new Error(
      "The Google account running setup could not be used as the notification recipient.",
    );
  var properties = getScriptProps();
  properties.setProperty(
    MRH_REVIEWER_ACCESS_NOTIFICATION_RECIPIENT_PROPERTY,
    recipient,
  );
  var cursor = properties.getProperty(
    MRH_REVIEWER_ACCESS_NOTIFICATION_CURSOR_PROPERTY,
  );
  if (cursor === null || cursor === "") {
    var latest = mrhSupabaseSelect_(
      MRH_SUPABASE_ACTIVITY_TABLE,
      "select=id&order=id.desc&limit=1",
    );
    properties.setProperty(
      MRH_REVIEWER_ACCESS_NOTIFICATION_CURSOR_PROPERTY,
      String(Math.max(0, latest.length ? Number(latest[0].id) || 0 : 0)),
    );
  } else if (!/^(?:0|[1-9]\d*)$/.test(String(cursor))) {
    throw new Error(
      "The reviewer access notification cursor is invalid; correct the Script Property before retrying setup.",
    );
  }
  var hasWorkerTrigger = ScriptApp.getProjectTriggers().some(
    function (trigger) {
      return (
        trigger.getHandlerFunction() ===
        "processReviewerAccessRequestNotifications"
      );
    },
  );
  if (!hasWorkerTrigger)
    ScriptApp.newTrigger("processReviewerAccessRequestNotifications")
      .timeBased()
      .everyMinutes(1)
      .create();
  return {
    status: "success",
    recipient: recipient,
    message:
      "Reviewer access request email notifications are installed. New requests are checked about once per minute.",
  };
}

function processReviewerAccessRequestNotifications() {
  var lock = LockService.getUserLock();
  if (!lock.tryLock(1000)) return { status: "busy" };
  try {
    var properties = getScriptProps();
    var recipient = String(
      properties.getProperty(
        MRH_REVIEWER_ACCESS_NOTIFICATION_RECIPIENT_PROPERTY,
      ) || "",
    ).trim();
    var cursorValue = String(
      properties.getProperty(
        MRH_REVIEWER_ACCESS_NOTIFICATION_CURSOR_PROPERTY,
      ) || "",
    );
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
      throw new Error(
        "Reviewer access notification recipient is not configured; run setupReviewerAccessRequestNotifications.",
      );
    if (!/^(?:0|[1-9]\d*)$/.test(cursorValue))
      throw new Error(
        "Reviewer access notification cursor is invalid; run setupReviewerAccessRequestNotifications.",
      );
    if (!getReviewerAuthorizationConfig_().enabled)
      throw new Error("Reviewer account authorization is not configured.");
    getPendingReviewerEnrollmentAuditRecords_()
      .filter(function (pending) {
        return (
          pending.record.state === "ready" &&
          pending.record.event === "APPLICATION_SUBMITTED"
        );
      })
      .forEach(function (pending) {
        flushReviewerEnrollmentAudit_(pending);
      });
    var cursor = Number(cursorValue);
    var rows = mrhSupabaseSelect_(
      MRH_SUPABASE_ACTIVITY_TABLE,
      "select=id,event,email,last_name,first_name,middle_initial,legacy_date,legacy_time&area=eq.REVIEWERS&event=eq.APPLICATION_SUBMITTED&id=gt." +
        cursor +
        "&order=id.asc&limit=" +
        MRH_REVIEWER_ACCESS_NOTIFICATION_BATCH_SIZE,
    );
    if (!rows.length) return { status: "idle", processed: 0 };
    rows.forEach(function (row) {
      var name = [row.first_name, row.middle_initial, row.last_name]
        .map(function (part) {
          return String(part || "").trim();
        })
        .filter(Boolean)
        .join(" ");
      var submittedAt = [row.legacy_date, row.legacy_time]
        .map(function (part) {
          return String(part || "").trim();
        })
        .filter(Boolean)
        .join(" ");
      MailApp.sendEmail({
        to: recipient,
        subject: "Maritime Review Hub: reviewer access request",
        body:
          "A reviewer access request was submitted.\n\nName: " +
          (name || "(not provided)") +
          "\nEmail: " +
          String(row.email || "").trim() +
          "\nSubmitted: " +
          (submittedAt || "(time unavailable)") +
          "\n\nReview the request in the Supabase mrh_activity_logs table, then check the matching account in mrh_accounts.",
      });
      cursor = Number(row.id);
      properties.setProperty(
        MRH_REVIEWER_ACCESS_NOTIFICATION_CURSOR_PROPERTY,
        String(cursor),
      );
    });
    return { status: "success", processed: rows.length };
  } finally {
    lock.releaseLock();
  }
}

function getMRHLocalDateTime_() {
  var now = new Date();
  return [
    Utilities.formatDate(now, MRH_SPREADSHEET_TIME_ZONE, "yyyy-MM-dd"),
    Utilities.formatDate(now, MRH_SPREADSHEET_TIME_ZONE, "hh:mm:ss a"),
  ];
}

function updateMRHAccountActivity_(
  account,
  storeId,
  issuanceReference,
  options,
) {
  var email = String((account && account.email) || "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error(
      "A verified account is required to update account activity.",
    );
  var hasIssuance = Boolean(issuanceReference);
  if (hasIssuance && !/^MRH-[0-9]{4}-[0-9]{4}$/.test(issuanceReference))
    throw new Error("Valid PDF issuance details are required.");
  var lastAccess = getMRHLocalDateTime_();
  var referenceChanged =
    hasIssuance &&
    String((account && account.permanentPdfIssuanceId) || "") !==
      String(issuanceReference);
  var patch = {
    last_access_date: lastAccess[0],
    last_access_time: lastAccess[1],
    updated_at: new Date().toISOString(),
  };
  // The issuance-reference allocator already persists a newly allocated value.
  // Only include this column when the supplied account snapshot actually differs.
  if (referenceChanged)
    patch.permanent_pdf_issuance_id = issuanceReference;
  var result = mrhSupabaseRows_(
    mrhSupabaseRequest_(
      MRH_SUPABASE_ACCOUNTS_TABLE,
      "patch",
      "email=eq." + encodeMRHSupabaseFilterValue_(email) + "&select=email",
      patch,
      "return=representation",
    ),
  );
  if (result.length !== 1) {
    // Opt-in only: the caller already holds an account it did not just re-read,
    // so a missing row keeps the previous "skip the activity update" behavior.
    if (result.length === 0 && options && options.tolerateMissing === true)
      return false;
    throw new Error("The verified account row is missing from Supabase.");
  }
  // Refresh the informational fields in an existing cache entry without extending
  // its original expiry. If the permanent reference changed and the cache cannot
  // be refreshed safely, invalidate it so authorization never reuses an old value.
  var cacheRefreshed = refreshMRHAccountActivityCache_(
    storeId || getMRHSupabaseConfig_().storeId,
    email,
    lastAccess,
    hasIssuance ? issuanceReference : "",
  );
  if (referenceChanged && !cacheRefreshed)
    invalidateMRHAccountCache_(
      storeId || getMRHSupabaseConfig_().storeId,
      email,
    );
  return true;
}
function getOrCreateReviewerPdfIssuanceReference_(
  account,
  storeId,
  reviewerPdfTimings,
) {
  var startedAt = Date.now();
  if (reviewerPdfTimings)
    reviewerPdfTimings.issuanceReferenceMode = "IN_PROGRESS";
  try {
    return getOrCreateReviewerPdfIssuanceReferenceInternal_(
      account,
      storeId,
      reviewerPdfTimings,
    );
  } catch (error) {
    if (reviewerPdfTimings)
      reviewerPdfTimings.issuanceReferenceMode =
        error && error.code === "TEMPORARY_UNAVAILABLE"
          ? "LOCK_TIMEOUT"
          : "FAILED";
    throw error;
  } finally {
    if (reviewerPdfTimings)
      reviewerPdfTimings.issuanceReferenceMs = Date.now() - startedAt;
  }
}

function getOrCreateReviewerPdfIssuanceReferenceInternal_(
  account,
  storeId,
  reviewerPdfTimings,
  requestContext,
) {
  var email = String((account && account.email) || "")
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("A verified account is required for a PDF reference.");
  // The reference is permanent once assigned. The account passed in was just
  // authorized (and is only cache-stale for MRH_ACCOUNT_CACHE_TTL_SECONDS, the
  // same freshness its status is trusted at), so reuse it without taking the
  // script-wide lock or re-reading Supabase. Allocation below is unchanged.
  if (
    /^MRH-[0-9]{4}-[0-9]{4}$/.test(String(account.permanentPdfIssuanceId || ""))
  ) {
    if (reviewerPdfTimings)
      reviewerPdfTimings.issuanceReferenceMode = "PERMANENT_READ";
    return String(account.permanentPdfIssuanceId);
  }
  var lock = LockService.getScriptLock();
  var waitStarted = Date.now();
  var acquired = false;
  try {
    acquired = lock.tryLock(10000);
  } finally {
    if (reviewerPdfTimings)
      reviewerPdfTimings.issuanceReferenceLockWaitMs = Date.now() - waitStarted;
  }
  if (!acquired) {
    var busy = new Error(
      "PDF reference creation is temporarily busy. Please try again.",
    );
    busy.code = "TEMPORARY_UNAVAILABLE";
    throw busy;
  }
  var holdStarted = Date.now();
  try {
    var current = findMRHAccount_(email, true);
    if (!current)
      throw new Error("The verified account row is missing from Supabase.");
    if (
      /^MRH-[0-9]{4}-[0-9]{4}$/.test(
        String(current.permanentPdfIssuanceId || ""),
      )
    ) {
      if (reviewerPdfTimings)
        reviewerPdfTimings.issuanceReferenceMode = "PERMANENT_READ";
      return current.permanentPdfIssuanceId;
    }
    for (var attempt = 0; attempt < 12; attempt += 1) {
      var reference = createReviewerPdfIssuanceReference_();
      var used = mrhSupabaseSelect_(
        MRH_SUPABASE_ACCOUNTS_TABLE,
        "select=email&permanent_pdf_issuance_id=eq." +
          encodeMRHSupabaseFilterValue_(reference) +
          "&limit=1",
      );
      if (used.length) continue;
      try {
        writeMRHAccountFields_(email, {
          "Permanent PDF Issuance ID": reference,
        });
        if (reviewerPdfTimings)
          reviewerPdfTimings.issuanceReferenceMode = "CREATED";
        return reference;
      } catch (writeError) {
        if (
          String(writeError.code || "") === "23505" ||
          Number(writeError.httpStatus) === 409
        )
          continue;
        throw writeError;
      }
    }
    throw new Error("A unique protected-PDF reference could not be allocated.");
  } finally {
    if (reviewerPdfTimings)
      reviewerPdfTimings.issuanceReferenceLockHoldMs = Date.now() - holdStarted;
    lock.releaseLock();
  }
}
function normalizeMRHLogTerm_(year, semester) {
  var normalizedYear = cleanText(year, 40);
  var normalizedSemester = cleanText(semester, 40);
  var combinedTerm = /^(\d+)\s*[./-]\s*(\d+)$/.exec(normalizedYear);
  if (combinedTerm) {
    normalizedYear = combinedTerm[1];
    if (!normalizedSemester) normalizedSemester = combinedTerm[2];
  }
  return { year: normalizedYear, semester: normalizedSemester };
}

function appendMRHAccessLog_(
  area,
  account,
  eventId,
  eventType,
  lockAlreadyHeld,
  skipAccountActivity,
  reviewerPdfTimings,
  existingSpreadsheet,
  options,
) {
  if (
    ["LIBRARY", "SYLLABUS", MRH_MODULE_LOG_SHEET_NAME, "REVIEWERS"].indexOf(
      area,
    ) < 0
  )
    throw new Error("Invalid dashboard access-log category.");
  if (
    reviewerPdfTimings &&
    typeof reviewerPdfTimings.auditDeduplicated === "undefined"
  )
    reviewerPdfTimings.auditDeduplicated = null;
  var eventName =
    typeof eventType === "string"
      ? eventType
      : String((eventType && eventType.event) || "ACTION");
  var eventRecord = eventType && typeof eventType === "object" ? eventType : {};
  var normalizedEventId = String(eventId || "").toLowerCase();
  var validEventId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      normalizedEventId,
    );
  var persistedAuditEventId =
    area === "REVIEWERS" &&
    [
      "PROFILE_UPDATED",
      "APPLICATION_SUBMITTED",
      "SIGN_OUT",
      "PROTECTED_PDF_VIEW",
      "PROTECTED_PDF_DOWNLOAD_ISSUED",
      "PDF_DOWNLOAD",
      "AUTO_RESTRICTED",
    ].indexOf(eventName) >= 0 &&
    validEventId
      ? normalizedEventId
      : "";
  var config = getReviewerAuthorizationConfig_();
  if (!config.enabled)
    throw new Error("Reviewer account authorization is not configured.");
  var dedupeKey = validEventId
    ? "mrh_logged_event_v2_" +
      sha256Hex(config.storeId + ":" + normalizedEventId)
    : "";
  var freshAuditEvent = Boolean(options && options.freshEventId === true);
  var trustedAccount = Boolean(options && options.trustedAccount === true);
  var pdfAuditEvent = area === "REVIEWERS" && [
    "PROTECTED_PDF_VIEW", "PROTECTED_PDF_DOWNLOAD_ISSUED", "PDF_DOWNLOAD",
  ].indexOf(eventName) >= 0;
  var atomicPdfAudit = Boolean(
    freshAuditEvent && trustedAccount && pdfAuditEvent && persistedAuditEventId &&
    String(getScriptProps().getProperty(MRH_PDF_ATOMIC_AUDIT_ENABLED_PROPERTY_) || "").toLowerCase() === "true"
  );
  if (reviewerPdfTimings && freshAuditEvent)
    reviewerPdfTimings.auditDedupeMs = 0;
  var cache = null;
  // A freshly generated server-side event ID cannot already be in the dedupe
  // cache. The database unique constraint handles the vanishingly rare collision.
  if (dedupeKey && !freshAuditEvent) {
    try {
      cache = CacheService.getScriptCache();
      if (cache.get(dedupeKey)) {
        if (reviewerPdfTimings) reviewerPdfTimings.auditDeduplicated = true;
        return false;
      }
    } catch (cacheError) {
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("appendMRHAccessLog_"), "[appendMRHAccessLog_] Event deduplication cache read failed.", { source: "migrated_structured_log", sourceLine: 2520 }, "appendMRHAccessLog_");
    }
  }
  var lock = null;
  var lockHoldStartedAt = 0;
  var routineFileClick = eventName === "FILE_CLICK" && !persistedAuditEventId;
  // Opt-in (options.freshEventId): the caller just generated this event ID, so
  // it cannot already exist and the duplicate pre-check can be skipped. The
  // insert still maps a unique-constraint conflict to "already logged".
  var lockWaitStartedAt = Date.now();
  if (
    !lockAlreadyHeld &&
    !routineFileClick &&
    !(freshAuditEvent && MRH_PDF_AUDIT_SKIP_SCRIPT_LOCK_)
  ) {
    lock = LockService.getScriptLock();
    var lockAcquired = lock.tryLock(10000);
    if (reviewerPdfTimings)
      reviewerPdfTimings.auditLockWaitMs = Date.now() - lockWaitStartedAt;
    if (!lockAcquired) {
      var busyError = new Error("Access logging is busy. Please try again.");
      busyError.code = "TEMPORARY_UNAVAILABLE";
      throw busyError;
    }
  } else if (reviewerPdfTimings) {
    reviewerPdfTimings.auditLockWaitMs = 0;
  }
  lockHoldStartedAt = Date.now();
  try {
    if (dedupeKey && !freshAuditEvent) {
      try {
        if (!cache) cache = CacheService.getScriptCache();
        if (cache.get(dedupeKey)) {
          if (reviewerPdfTimings) reviewerPdfTimings.auditDeduplicated = true;
          return false;
        }
      } catch (cacheError) {
        LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("appendMRHAccessLog_"), "[appendMRHAccessLog_] Event deduplication cache read failed.", { source: "migrated_structured_log", sourceLine: 2559 }, "appendMRHAccessLog_");
      }
    }
    if (persistedAuditEventId && !freshAuditEvent) {
      var existing = mrhSupabaseSelect_(
        MRH_SUPABASE_ACTIVITY_TABLE,
        "select=id&audit_event_id=eq." +
          encodeMRHSupabaseFilterValue_(persistedAuditEventId) +
          "&limit=1",
      );
      if (existing.length) {
        if (dedupeKey && cache)
          cache.put(dedupeKey, "logged", MRH_LOG_DEDUPE_TTL_SECONDS);
        if (reviewerPdfTimings) reviewerPdfTimings.auditDeduplicated = true;
        return false;
      }
    }
    var logArea =
      typeof eventName === "string" && eventName.indexOf("SIGN_IN") === 0
        ? MRH_SIGN_IN_SHEET_NAME
        : area;
    var dateTime = getMRHLocalDateTime_();
    var term = normalizeMRHLogTerm_(eventRecord.year, eventRecord.semester);
    var email = account
      ? String(account.email || "")
          .trim()
          .toLowerCase()
      : "";
    var accountRecord = null;
    // Opt-in (options.trustedAccount): the caller passes an account it verified
    // moments ago; updateMRHAccountActivity_ only needs its email, and the
    // PATCH itself confirms the row exists, so the extra uncached read is skipped.
    if (email && !skipAccountActivity && !atomicPdfAudit)
      accountRecord = trustedAccount ? account : findMRHAccount_(email, true);
    if (accountRecord && !skipAccountActivity && !atomicPdfAudit) {
      var accountActivityStartedAt = Date.now();
      try {
        updateMRHAccountActivity_(
          accountRecord,
          config.storeId,
          eventRecord.issuanceReference,
          trustedAccount ? { tolerateMissing: true } : undefined,
        );
      } finally {
        if (reviewerPdfTimings)
          reviewerPdfTimings.auditAccountActivityMs =
            Date.now() - accountActivityStartedAt;
      }
    }
    var row = {
      area: logArea,
      source_event_id: validEventId ? normalizedEventId : null,
      audit_event_id: persistedAuditEventId || null,
      legacy_date: dateTime[0],
      legacy_time: dateTime[1],
      email: email || null,
      last_name: account ? cleanText(account.lastName, 100) : "",
      first_name: account ? cleanText(account.firstName, 100) : "",
      middle_initial: account ? cleanText(account.middleInitial, 10) : "",
      event: cleanText(eventName, 80),
      course_code: cleanText(eventRecord.course, 160),
      year: term.year,
      semester: term.semester,
      category: cleanText(eventRecord.category, 40),
      course: cleanText(eventRecord.resource, 200),
      resource: cleanText(eventRecord.resource, 200),
      issuance_reference: cleanText(eventRecord.issuanceReference, 40),
      source_file_id: cleanText(eventRecord.sourceFileId, 200),
      record: {
        eventId: validEventId ? normalizedEventId : "",
        area: logArea,
        event: eventName,
        account: account || null,
        details: eventRecord,
      },
    };
    var auditAppendStartedAt = Date.now();
    try {
      if (atomicPdfAudit) {
        var atomicLastAccess = dateTime;
        var atomicResult = mrhSupabaseRpc_("mrh_record_reviewer_pdf_access", {
          p_email: email,
          p_audit_event_id: persistedAuditEventId,
          p_last_access_date: atomicLastAccess[0],
          p_last_access_time: atomicLastAccess[1],
          p_updated_at: new Date().toISOString(),
          p_row: row,
        });
        if (Array.isArray(atomicResult)) atomicResult = atomicResult[0];
        if (!atomicResult || atomicResult.ok !== true)
          throw new Error("The atomic protected-PDF audit RPC returned an invalid response.");
        if (atomicResult.duplicate === true) {
          if (dedupeKey && cache) cache.put(dedupeKey, "logged", MRH_LOG_DEDUPE_TTL_SECONDS);
          if (reviewerPdfTimings) reviewerPdfTimings.auditDeduplicated = true;
          return false;
        }
        if (atomicResult.audit_inserted !== true)
          throw new Error("The atomic protected-PDF audit RPC did not confirm its audit insert.");
        if (atomicResult.account_updated === true) {
          var activityCacheRefreshed = refreshMRHAccountActivityCache_(
            config.storeId, email, atomicLastAccess, eventRecord.issuanceReference || "",
          );
          if (!activityCacheRefreshed)
            invalidateMRHAccountCache_(config.storeId, email);
        } else {
          // The account may have been removed after the authorization read.
          // Never keep a cached authorization entry alive after the RPC reports
          // that no account row was updated.
          invalidateMRHAccountCache_(config.storeId, email);
        }
      } else {
        mrhSupabaseRequest_(
          MRH_SUPABASE_ACTIVITY_TABLE,
          "post",
          "select=id",
          row,
          "return=representation",
        );
      }
    } catch (insertError) {
      if (
        persistedAuditEventId &&
        (String(insertError.code || "") === "23505" ||
          Number(insertError.httpStatus) === 409)
      ) {
        if (dedupeKey && cache)
          cache.put(dedupeKey, "logged", MRH_LOG_DEDUPE_TTL_SECONDS);
        if (reviewerPdfTimings) reviewerPdfTimings.auditDeduplicated = true;
        return false;
      }
      throw insertError;
    } finally {
      if (reviewerPdfTimings)
        reviewerPdfTimings.auditAppendMs = Date.now() - auditAppendStartedAt;
    }
    if (dedupeKey && cache)
      cache.put(dedupeKey, "logged", MRH_LOG_DEDUPE_TTL_SECONDS);
    if (reviewerPdfTimings) reviewerPdfTimings.auditDeduplicated = false;
    return true;
  } finally {
    if (reviewerPdfTimings && lockHoldStartedAt)
      reviewerPdfTimings.auditLockHoldMs = lock
        ? Date.now() - lockHoldStartedAt
        : 0;
    if (lock) lock.releaseLock();
  }
}
function verifyReviewerIdentityToken_(idToken, expectedClientId) {
  var token = String(idToken || "").trim();
  if (!token || token.length > 8192)
    return { valid: false, code: "UNAUTHORIZED" };

  var tokenCacheKey = "mrh_google_token_v1_" + sha256Hex(token);
  var tokenCache = null;
  var cachedIdentity = null;
  try {
    tokenCache = CacheService.getScriptCache();
    cachedIdentity = tokenCache.get(tokenCacheKey);
  } catch (cacheError) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("verifyReviewerIdentityToken_"), "[verifyReviewerIdentityToken_] Token cache read failed.", { source: "migrated_structured_log", sourceLine: 2687 }, "verifyReviewerIdentityToken_");
  }
  if (cachedIdentity) {
    try {
      var cachedClaims = JSON.parse(cachedIdentity);
      if (
        cachedClaims &&
        cachedClaims.clientId === expectedClientId &&
        Number(cachedClaims.expiresAt) > Math.floor(Date.now() / 1000) &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(cachedClaims.email || ""))
      )
        return {
          valid: true,
          email: String(cachedClaims.email),
          picture: getVerifiedGooglePicture_(cachedClaims.picture),
          suggestedFirstName: cleanText(cachedClaims.suggestedFirstName, 100),
          suggestedLastName: cleanText(cachedClaims.suggestedLastName, 100),
        };
    } catch (cacheError) {
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("verifyReviewerIdentityToken_"), "[verifyReviewerIdentityToken_] Removed invalid token cache data.", { source: "migrated_structured_log", sourceLine: 2706 }, "verifyReviewerIdentityToken_");
    }
    try {
      tokenCache.remove(tokenCacheKey);
    } catch (cacheError) {
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("verifyReviewerIdentityToken_"), "[verifyReviewerIdentityToken_] Invalid token cache entry could not be removed.", { source: "migrated_structured_log", sourceLine: 2713 }, "verifyReviewerIdentityToken_");
    }
  }

  var response = null;
  var responseCode = 0;
  var fetchFailure = "";
  var tokenInfoEndpoints = [
    "https://oauth2.googleapis.com/tokeninfo?id_token=",
    "https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=",
  ];
  for (
    var endpointIndex = 0;
    endpointIndex < tokenInfoEndpoints.length;
    endpointIndex++
  ) {
    try {
      response = mrhLoggedUrlFetch_(
        tokenInfoEndpoints[endpointIndex] + encodeURIComponent(token),
        { muteHttpExceptions: true },
        { provider: "Google OAuth tokeninfo", operation: "verify_id_token" },
      );
      responseCode = response.getResponseCode();
      if (responseCode !== 429 && responseCode < 500) break;
      fetchFailure = "HTTP_" + responseCode;
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("verifyReviewerIdentityToken_"), "[verifyReviewerIdentityToken_] Google token verification endpoint returned a transient error.", { source: "migrated_structured_log", sourceLine: 2740 }, "verifyReviewerIdentityToken_");
    } catch (error) {
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("verifyReviewerIdentityToken_"), "[verifyReviewerIdentityToken_] Google token verification endpoint was unreachable.", { source: "migrated_structured_log", sourceLine: 2744 }, "verifyReviewerIdentityToken_");
      var errorMessage = String((error && error.message) || "");
      if (
        /permission|authorization required/i.test(errorMessage) ||
        /auth\/script\.external_request/i.test(errorMessage)
      )
        return { valid: false, code: "AUTH_PERMISSION_REQUIRED" };
      // Keep upstream diagnostics server-side; exception text can expose URLs
      // or deployment details and is not required by the client contract.
      fetchFailure = "FETCH_EXCEPTION";
    }
  }
  if (!response || responseCode >= 500 || responseCode === 429)
    return {
      valid: false,
      code: "AUTH_PROVIDER_UNAVAILABLE",
      verificationFailure: fetchFailure || "NO_RESPONSE",
    };
  if (responseCode !== 200) return { valid: false, code: "UNAUTHORIZED" };

  var claims;
  try {
    claims = JSON.parse(response.getContentText());
  } catch (error) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("verifyReviewerIdentityToken_"), "[verifyReviewerIdentityToken_] Google returned invalid token data.", { source: "migrated_structured_log", sourceLine: 2770 }, "verifyReviewerIdentityToken_");
    return { valid: false, code: "AUTH_PROVIDER_UNAVAILABLE" };
  }
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("verifyReviewerIdentityToken_"), "[verifyReviewerIdentityToken_] Google returned invalid token data.", { source: "migrated_structured_log", sourceLine: 2776 }, "verifyReviewerIdentityToken_");
    return { valid: false, code: "AUTH_PROVIDER_UNAVAILABLE" };
  }
  var issuer = String(claims.iss || "");
  var expiresAt = Number(claims.exp);
  var email = String(claims.email || "").trim();
  var picture = getVerifiedGooglePicture_(claims.picture);
  if (
    String(claims.aud || "") !== expectedClientId ||
    (issuer !== "accounts.google.com" &&
      issuer !== "https://accounts.google.com") ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Math.floor(Date.now() / 1000) ||
    String(claims.email_verified || "").toLowerCase() !== "true" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return { valid: false, code: "UNAUTHORIZED" };
  }
  var tokenCacheTtl = Math.min(
    MRH_TOKEN_CACHE_MAX_TTL_SECONDS,
    expiresAt - Math.floor(Date.now() / 1000),
  );
  if (tokenCacheTtl > 0) {
    try {
      if (!tokenCache) tokenCache = CacheService.getScriptCache();
      tokenCache.put(
        tokenCacheKey,
        JSON.stringify({
          email: email,
          picture: picture,
          suggestedFirstName: cleanText(claims.given_name, 100),
          suggestedLastName: cleanText(claims.family_name, 100),
          clientId: expectedClientId,
          expiresAt: expiresAt,
        }),
        tokenCacheTtl,
      );
    } catch (cacheError) {
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("verifyReviewerIdentityToken_"), "[verifyReviewerIdentityToken_] Token cache write failed.", { source: "migrated_structured_log", sourceLine: 2816 }, "verifyReviewerIdentityToken_");
    }
  }
  return {
    valid: true,
    email: email,
    picture: picture,
    suggestedFirstName: cleanText(claims.given_name, 100),
    suggestedLastName: cleanText(claims.family_name, 100),
  };
}

function getVerifiedGooglePicture_(value) {
  var picture = String(value || "").trim();
  return /^https:\/\/lh[3-6]\.googleusercontent\.com\/[A-Za-z0-9_./?=&%-]+$/.test(
    picture,
  )
    ? picture
    : "";
}

function getReviewerAccountStatusResponse_(identity) {
  var account = findMRHAccount_(identity.email, false);
  var accountStatus =
    account && hasCompleteReviewerProfile_(account)
      ? account.accountStatus
      : "NOT_FOUND";
  return {
    status: "success",
    email: identity.email,
    picture: identity.picture,
    suggestedFirstName: cleanText(identity.suggestedFirstName, 100),
    suggestedLastName: cleanText(identity.suggestedLastName, 100),
    accountStatus: accountStatus,
    active: Boolean(account && accountStatus === "TRUE"),
    lastName: account ? account.lastName : "",
    firstName: account ? account.firstName : "",
    middleInitial: account ? account.middleInitial : "",
  };
}

function hasCompleteReviewerProfile_(account) {
  var middleInitial = String((account && account.middleInitial) || "").trim();
  return Boolean(
    account &&
    String(account.lastName || "").trim() &&
    String(account.firstName || "").trim() &&
    (!middleInitial ||
      /^[A-Za-z]\.$/.test(middleInitial) ||
      /^N\/A$/i.test(middleInitial)),
  );
}

function verifyReviewerRequestIdentity_(data) {
  var config = getReviewerAuthorizationConfig_();
  if (!config.enabled)
    return {
      error: errorResponse(
        "Reviewer account authorization is not configured.",
        "FEATURE_DISABLED",
      ),
    };
  var sessionId = String((data && data.sessionId) || "").trim();
  var identity = sessionId
    ? verifyReviewerSession_(sessionId, data)
    : verifyReviewerIdentityToken_(data && data.idToken, config.clientId);
  if (!identity.valid) {
    var providerUnavailable = identity.code === "AUTH_PROVIDER_UNAVAILABLE";
    return {
      error: errorResponse(
        providerUnavailable
          ? "Google sign-in verification is temporarily unavailable."
          : identity.code === "SESSION_EXPIRED"
            ? "Your access session has expired. Sign in with Google again."
            : identity.code === "SESSION_INVALID"
              ? "Your access session is no longer valid. Sign in with Google again."
              : identity.code === "AUTH_PERMISSION_REQUIRED"
                ? "The reviewer sign-in service needs Apps Script external-request permission. The script owner must run initializeMRHAccountsSpreadsheet() and approve the requested access."
                : "A valid Google sign-in is required.",
        identity.code,
        providerUnavailable
          ? { verificationFailure: identity.verificationFailure }
          : undefined,
      ),
    };
  }
  return { identity: identity };
}

function getReviewerSessionPropertyKey_(sessionId) {
  return REVIEWER_SESSION_PROPERTY_PREFIX + sha256Hex(sessionId);
}

function isValidReviewerSessionRecord_(session) {
  return Boolean(
    session &&
    typeof session === "object" &&
    !Array.isArray(session) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(session.email || "")) &&
    typeof session.createdAt === "number" &&
    Number.isFinite(session.createdAt) &&
    session.createdAt > 0 &&
    typeof session.expiresAt === "number" &&
    Number.isFinite(session.expiresAt) &&
    session.expiresAt > session.createdAt,
  );
}

function isValidReviewerSessionPublicKey_(publicKey) {
  return Boolean(
    typeof publicKey === "string" &&
    publicKey.length <= 1024 &&
    /^-----BEGIN PUBLIC KEY-----\n(?:[A-Za-z0-9+/]{1,64}\n)+[A-Za-z0-9+/]{1,64}={0,2}\n-----END PUBLIC KEY-----$/.test(
      publicKey,
    ),
  );
}

function verifyReviewerSessionProof_(session, data) {
  var proof = String((data && data.sessionProof) || "");
  if (
    !isValidReviewerSessionPublicKey_(session && session.publicKey) ||
    !/^[A-Za-z0-9+/]{342}==$/.test(proof)
  )
    return false;
  var signedRequest = Object.assign({}, data);
  delete signedRequest.sessionProof;
  try {
    var verifier = new KJUR.crypto.Signature({ alg: "SHA256withRSA" });
    verifier.init(KEYUTIL.getKey(session.publicKey));
    verifier.updateString(JSON.stringify(signedRequest));
    var signatureHex = Utilities.base64Decode(proof)
      .map(function (byte) {
        var hex = ((byte + 256) % 256).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("");
    return verifier.verify(signatureHex);
  } catch (error) {
    return false;
  }
}

function cleanupExpiredReviewerSessionProperties_() {
  var properties = getScriptProps();
  // Read the property store once. Session creation also needs its total size,
  // so calculate that value during this pass instead of calling getProperties()
  // and iterating over every property a second time while holding the script lock.
  var allProperties = properties.getProperties();
  var activeCount = 0;
  var removedCount = 0;
  var storeBytes = 0;
  var accountCounts = Object.create(null);
  var now = Date.now();
  Object.keys(allProperties).forEach(function (key) {
    var value = String(allProperties[key] || "");
    if (key.indexOf(REVIEWER_SESSION_PROPERTY_PREFIX) !== 0) {
      storeBytes += utf8ByteLength_(key) + utf8ByteLength_(value);
      return;
    }
    var hasValidKey = /^[a-f0-9]{64}$/.test(
      key.substring(REVIEWER_SESSION_PROPERTY_PREFIX.length),
    );
    var session = null;
    try {
      session = JSON.parse(value);
    } catch (error) {
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("cleanupExpiredReviewerSessionProperties_"), "[cleanupExpiredReviewerSessionProperties_] Removed malformed session record.", { source: "migrated_structured_log", sourceLine: 2983 }, "cleanupExpiredReviewerSessionProperties_");
    }
    if (
      !hasValidKey ||
      !isValidReviewerSessionRecord_(session) ||
      !isValidReviewerSessionPublicKey_(session.publicKey) ||
      session.expiresAt <= now
    ) {
      properties.deleteProperty(key);
      removedCount += 1;
      return;
    }
    // Match the previous post-cleanup size calculation: expired or malformed
    // session properties are excluded because they have just been deleted.
    storeBytes += utf8ByteLength_(key) + utf8ByteLength_(value);
    activeCount += 1;
    var normalizedEmail = String(session.email || "")
      .trim()
      .toLowerCase();
    if (normalizedEmail)
      accountCounts[normalizedEmail] =
        (accountCounts[normalizedEmail] || 0) + 1;
  });
  return {
    activeCount: activeCount,
    removedCount: removedCount,
    accountCounts: accountCounts,
    storeBytes: storeBytes,
  };
}

function cleanupExpiredReviewerSessionProperties() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000))
    throw new Error("Reviewer session cleanup is busy. Please try again.");
  try {
    var result = cleanupExpiredReviewerSessionProperties_();
    LoggerService.log("INFO", mrhLoggerCategoryForFunction_("cleanupExpiredReviewerSessionProperties"), "reviewer_session_cleanup", {
        event: "reviewer_session_cleanup",
        activeCount: result.activeCount,
        removedCount: result.removedCount,
      }, "cleanupExpiredReviewerSessionProperties");
    return {
      activeCount: result.activeCount,
      removedCount: result.removedCount,
    };
  } finally {
    lock.releaseLock();
  }
}

function createReviewerSession_(identity, publicKey) {
  if (!isValidReviewerSessionPublicKey_(publicKey))
    return {
      error: errorResponse(
        "A valid Reviewer session public key is required.",
        "BAD_REQUEST",
      ),
    };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000))
    return {
      error: errorResponse(
        "Reviewer sign-in is busy. Please try again.",
        "SESSION_BUSY",
      ),
    };
  try {
    var properties = getScriptProps();
    var sessionState = cleanupExpiredReviewerSessionProperties_();
    var now = Date.now();
    var normalizedIdentityEmail = String(identity.email || "")
      .trim()
      .toLowerCase();
    if (
      !normalizedIdentityEmail ||
      (sessionState.accountCounts[normalizedIdentityEmail] || 0) >=
        REVIEWER_SESSION_PER_ACCOUNT_LIMIT
    )
      return {
        error: errorResponse(
          "This account already has the maximum number of active sessions. Sign out of another device or try again later.",
          "SESSION_ACCOUNT_CAPACITY",
        ),
      };
    if (sessionState.activeCount >= REVIEWER_SESSION_LIMIT)
      return {
        error: errorResponse(
          "The access session service is at capacity. Please try again later.",
          "SESSION_CAPACITY",
        ),
      };
    var sessionId = [
      Utilities.getUuid(),
      Utilities.getUuid(),
      Utilities.getUuid(),
    ]
      .join("")
      .replace(/-/g, "")
      .toLowerCase();
    var expiresAt = now + REVIEWER_SESSION_TTL_MS;
    var sessionKey = getReviewerSessionPropertyKey_(sessionId);
    var sessionValue = JSON.stringify({
      email: identity.email,
      picture: identity.picture,
      suggestedFirstName: cleanText(identity.suggestedFirstName, 100),
      suggestedLastName: cleanText(identity.suggestedLastName, 100),
      createdAt: now,
      expiresAt: expiresAt,
      publicKey: publicKey,
    });
    var sessionPropertyBytes =
      utf8ByteLength_(sessionKey) + utf8ByteLength_(sessionValue);
    // cleanupExpiredReviewerSessionProperties_ already measured the exact
    // post-cleanup property-store size during its single property scan.
    var storeBytes = sessionState.storeBytes;
    if (
      sessionPropertyBytes > REVIEWER_SESSION_PROPERTY_MAX_BYTES ||
      storeBytes + sessionPropertyBytes >
        REVIEWER_SESSION_PROPERTY_STORE_BUDGET_BYTES
    )
      return {
        error: errorResponse(
          "The access session service is at capacity. Please try again later.",
          "SESSION_CAPACITY",
        ),
      };
    if (properties.getProperty(sessionKey))
      return {
        error: errorResponse(
          "Reviewer sign-in is busy. Please try again.",
          "SESSION_BUSY",
        ),
      };
    properties.setProperty(sessionKey, sessionValue);
    return { sessionId: sessionId, expiresAt: expiresAt };
  } finally {
    lock.releaseLock();
  }
}

function verifyReviewerSession_(sessionId, requestData, requireProof) {
  if (!/^[a-f0-9]{96}$/.test(sessionId))
    return { valid: false, code: "SESSION_INVALID" };
  var propertyKey = getReviewerSessionPropertyKey_(sessionId);
  var properties = getScriptProps();
  var rawSession = properties.getProperty(propertyKey);
  if (!rawSession) return { valid: false, code: "SESSION_INVALID" };
  var session = null;
  try {
    session = JSON.parse(rawSession);
  } catch (error) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("verifyReviewerSession_"), "[verifyReviewerSession_] Removed malformed session record.", { source: "migrated_structured_log", sourceLine: 3139 }, "verifyReviewerSession_");
  }
  if (!isValidReviewerSessionRecord_(session)) {
    properties.deleteProperty(propertyKey);
    return { valid: false, code: "SESSION_INVALID" };
  }
  if (session.expiresAt <= Date.now()) {
    properties.deleteProperty(propertyKey);
    return { valid: false, code: "SESSION_EXPIRED" };
  }
  if (
    requireProof !== false &&
    !verifyReviewerSessionProof_(session, requestData)
  )
    return { valid: false, code: "SESSION_INVALID" };
  return {
    valid: true,
    email: String(session.email),
    picture: getVerifiedGooglePicture_(session.picture),
    suggestedFirstName: cleanText(session.suggestedFirstName, 100),
    suggestedLastName: cleanText(session.suggestedLastName, 100),
  };
}

function getReviewerSignOutAuditPropertyKey_(eventId) {
  return (
    MRH_REVIEWER_SIGNOUT_AUDIT_PREFIX +
    sha256Hex(String(eventId || "").toLowerCase())
  );
}

function setReviewerPendingAuditProperty_(key, record) {
  var properties = getScriptProps();
  var allProperties = properties.getProperties();
  var value = JSON.stringify(record);
  var propertyBytes = utf8ByteLength_(key) + utf8ByteLength_(value);
  if (propertyBytes > REVIEWER_SESSION_PROPERTY_MAX_BYTES)
    throw new Error("The reviewer audit record exceeds its storage limit.");
  var storeBytes = 0;
  Object.keys(allProperties).forEach(function (propertyKey) {
    storeBytes +=
      utf8ByteLength_(propertyKey) +
      utf8ByteLength_(allProperties[propertyKey] || "");
  });
  if (Object.prototype.hasOwnProperty.call(allProperties, key))
    storeBytes -=
      utf8ByteLength_(key) + utf8ByteLength_(allProperties[key] || "");
  if (storeBytes + propertyBytes > REVIEWER_SESSION_PROPERTY_STORE_BUDGET_BYTES)
    throw new Error("The reviewer audit record store is at capacity.");
  properties.setProperty(key, value);
}

function validateReviewerSignOutAuditRecord_(record, eventId, sessionHash) {
  return Boolean(
    record &&
    typeof record === "object" &&
    !Array.isArray(record) &&
    String(record.eventId || "").toLowerCase() ===
      String(eventId || "").toLowerCase() &&
    record.event === "SIGN_OUT" &&
    /^[a-f0-9]{64}$/i.test(String(sessionHash || "")) &&
    String(record.sessionIdHash || "").toLowerCase() ===
      String(sessionHash).toLowerCase() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(record.email || "")) &&
    record.account &&
    String(record.account.email || "")
      .trim()
      .toLowerCase() ===
      String(record.email || "")
        .trim()
        .toLowerCase(),
  );
}

function stageReviewerSignOutAudit_(session, sessionId, eventId) {
  var key = getReviewerSignOutAuditPropertyKey_(eventId);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    var busyError = new Error(
      "Sign-out audit preparation is busy. Please try again.",
    );
    busyError.code = "TEMPORARY_UNAVAILABLE";
    throw busyError;
  }
  try {
    var properties = getScriptProps();
    var existing = properties.getProperty(key);
    if (existing) {
      var existingRecord;
      try {
        existingRecord = JSON.parse(existing);
      } catch (error) {
        throw new Error("The pending sign-out audit record is malformed.");
      }
      if (
        !validateReviewerSignOutAuditRecord_(
          existingRecord,
          eventId,
          sha256Hex(sessionId),
        )
      )
        throw new Error("The sign-out event ID is already in use.");
      return { key: key, record: existingRecord };
    }
    var account = findMRHAccount_(session.email, true) || {
      email: session.email,
    };
    var record = {
      eventId: String(eventId).toLowerCase(),
      sessionIdHash: sha256Hex(sessionId),
      email: String(session.email || "")
        .trim()
        .toLowerCase(),
      event: "SIGN_OUT",
      account: {
        email: String(account.email || session.email)
          .trim()
          .toLowerCase(),
        lastName: String(account.lastName || ""),
        firstName: String(account.firstName || ""),
        middleInitial: String(account.middleInitial || ""),
      },
      createdAt: Date.now(),
    };
    setReviewerPendingAuditProperty_(key, record);
    return { key: key, record: record };
  } finally {
    lock.releaseLock();
  }
}

function readReviewerSignOutAudit_(eventId, sessionId) {
  var key = getReviewerSignOutAuditPropertyKey_(eventId);
  var rawRecord = getScriptProps().getProperty(key);
  if (!rawRecord) return null;
  var record;
  try {
    record = JSON.parse(rawRecord);
  } catch (error) {
    throw new Error("The pending sign-out audit record is malformed.");
  }
  if (
    !validateReviewerSignOutAuditRecord_(record, eventId, sha256Hex(sessionId))
  )
    throw new Error("The pending sign-out audit record is invalid.");
  return { key: key, record: record };
}

function flushReviewerSignOutAudit_(pending) {
  if (!pending || !pending.record)
    throw new Error("The pending sign-out audit record is unavailable.");
  appendMRHAccessLog_(
    "REVIEWERS",
    pending.record.account,
    pending.record.eventId,
    "SIGN_OUT",
  );
  getScriptProps().deleteProperty(pending.key);
}

function reviewerAuditEventExists_(eventId) {
  var config = getReviewerAuthorizationConfig_();
  if (!config.enabled) return false;
  var normalized = String(eventId || "")
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  return (
    mrhSupabaseSelect_(
      MRH_SUPABASE_ACTIVITY_TABLE,
      "select=id&audit_event_id=eq." +
        encodeMRHSupabaseFilterValue_(normalized) +
        "&limit=1",
    ).length > 0
  );
}
function recoverPendingReviewerSignOutAudits_(email) {
  var normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  var allProperties = getScriptProps().getProperties();
  Object.keys(allProperties)
    .filter(function (key) {
      return key.indexOf(MRH_REVIEWER_SIGNOUT_AUDIT_PREFIX) === 0;
    })
    .forEach(function (key) {
      var record;
      try {
        record = JSON.parse(allProperties[key]);
      } catch (error) {
        LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("recoverPendingReviewerSignOutAudits_"), "[recoverPendingReviewerSignOutAudits_] Pending sign-out audit record is malformed.", { source: "migrated_structured_log", sourceLine: 3329 }, "recoverPendingReviewerSignOutAudits_");
        return;
      }
      if (
        !record ||
        key !== getReviewerSignOutAuditPropertyKey_(record.eventId) ||
        String(record.email || "")
          .trim()
          .toLowerCase() !== normalizedEmail
      )
        return;
      try {
        if (
          !validateReviewerSignOutAuditRecord_(
            record,
            record.eventId,
            record.sessionIdHash,
          )
        )
          throw new Error("The pending sign-out audit record is invalid.");
        flushReviewerSignOutAudit_({ key: key, record: record });
      } catch (error) {
        LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("recoverPendingReviewerSignOutAudits_"), "[recoverPendingReviewerSignOutAudits_] Pending sign-out audit retry failed.", { source: "migrated_structured_log", sourceLine: 3353 }, "recoverPendingReviewerSignOutAudits_");
      }
    });
}

function revokeReviewerSession_(sessionId) {
  if (!/^[a-f0-9]{96}$/.test(sessionId)) return false;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return false;
  try {
    getScriptProps().deleteProperty(getReviewerSessionPropertyKey_(sessionId));
    return true;
  } finally {
    lock.releaseLock();
  }
}

function recordReviewerSignInAudit_(response, eventId) {
  var account =
    response.accountStatus === "NOT_FOUND"
      ? { email: response.email }
      : {
          email: response.email,
          lastName: response.lastName,
          firstName: response.firstName,
          middleInitial: response.middleInitial,
        };
  appendMRHAccessLog_(
    "REVIEWERS",
    account,
    eventId,
    "SIGN_IN:" + response.accountStatus,
  );
  if (response.accountStatus === "DENIED")
    writeCentralWebAppLog_({
      severity: "WARN",
      event: "reviewer_account_denied",
      outcome: "denied",
      method: "POST",
      requestType: "reviewer_security_event",
      activity: "ACCOUNT_DENIED",
      responseCode: "ACCOUNT_DENIED",
    });
}

function handleReviewerSignInRequest(data, requestStartedAt, correlationId) {
  var identityStartedAt = Date.now();
  var verified = verifyReviewerRequestIdentity_(data);
  var identityVerificationMs = Date.now() - identityStartedAt;
  if (verified.error) return verified.error;
  recoverPendingReviewerSignOutAudits_(verified.identity.email);
  var accountLookupStartedAt = Date.now();
  var response = getReviewerAccountStatusResponse_(verified.identity);
  var accountLookupMs = Date.now() - accountLookupStartedAt;
  var auditStartedAt = Date.now();
  recordReviewerSignInAudit_(response, data && data.eventId);
  var auditWriteMs = Date.now() - auditStartedAt;
  var sessionCreationStartedAt = Date.now();
  var session = createReviewerSession_(
    verified.identity,
    data && data.sessionPublicKey,
  );
  var sessionCreationMs = Date.now() - sessionCreationStartedAt;
  if (session.error) {
    logBackendContention_(
      "verify_reviewer_access",
      correlationId || (data && data.eventId),
      "SESSION_BUSY",
      data && data.appVersion,
      Number.isFinite(Number(requestStartedAt))
        ? Date.now() - Number(requestStartedAt)
        : -1,
    );
    return session.error;
  }
  response.sessionId = session.sessionId;
  response.expiresAt = session.expiresAt;
  LoggerService.log("INFO", mrhLoggerCategoryForFunction_("handleReviewerSignInRequest"), "reviewer_sign_in_timing", {
      event: "reviewer_sign_in_timing",
      correlationId: String(correlationId || (data && data.eventId) || ""),
      identityVerificationMs: identityVerificationMs,
      accountLookupMs: accountLookupMs,
      auditWriteMs: auditWriteMs,
      sessionCreationMs: sessionCreationMs,
      totalMs: Number.isFinite(Number(requestStartedAt))
        ? Date.now() - Number(requestStartedAt)
        : -1,
      appVersion: String((data && data.appVersion) || ""),
    }, "handleReviewerSignInRequest");
  return jsonResponse(response);
}

function handleLogReviewerSignInRequest(data) {
  var verified = verifyReviewerRequestIdentity_(data);
  if (verified.error) return verified.error;
  var response = getReviewerAccountStatusResponse_(verified.identity);
  recordReviewerSignInAudit_(response, data && data.eventId);
  return jsonResponse({ status: "success" });
}

function handleRestoreReviewerSessionRequest(data) {
  var verified = verifyReviewerRequestIdentity_(data);
  if (verified.error) return verified.error;
  return jsonResponse(getReviewerAccountStatusResponse_(verified.identity));
}

function handleRevokeReviewerSessionRequest(data) {
  var sessionId = String((data && data.sessionId) || "").trim();
  var eventId = String((data && data.eventId) || "").trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      eventId,
    )
  )
    return errorResponse(
      "A valid sign-out event ID is required.",
      "BAD_REQUEST",
    );
  var session = verifyReviewerSession_(sessionId, data, false);
  var auditLogged = true;
  var pendingAudit = null;
  if (session.valid) {
    try {
      pendingAudit = stageReviewerSignOutAudit_(session, sessionId, eventId);
    } catch (error) {
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("handleRevokeReviewerSessionRequest"), "[handleRevokeReviewerSessionRequest] Sign-out audit could not be prepared.", { source: "migrated_structured_log", sourceLine: 3482 }, "handleRevokeReviewerSessionRequest");
      return errorResponse(
        "The session could not be safely revoked yet. Retry sign-out while connected.",
        "SIGNOUT_AUDIT_NOT_STAGED",
      );
    }
    try {
      flushReviewerSignOutAudit_(pendingAudit);
    } catch (error) {
      auditLogged = false;
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("handleRevokeReviewerSessionRequest"), "[handleRevokeReviewerSessionRequest] Sign-out audit remains pending.", { source: "migrated_structured_log", sourceLine: 3494 }, "handleRevokeReviewerSessionRequest");
    }
  } else {
    try {
      pendingAudit = readReviewerSignOutAudit_(eventId, sessionId);
      if (pendingAudit) flushReviewerSignOutAudit_(pendingAudit);
      else auditLogged = reviewerAuditEventExists_(eventId);
    } catch (error) {
      auditLogged = false;
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("handleRevokeReviewerSessionRequest"), "[handleRevokeReviewerSessionRequest] Sign-out audit retry failed.", { source: "migrated_structured_log", sourceLine: 3505 }, "handleRevokeReviewerSessionRequest");
    }
  }
  if (!revokeReviewerSession_(sessionId))
    return errorResponse(
      "The access session could not be revoked right now. Try signing out again.",
      "SESSION_REVOKE_FAILED",
    );
  return jsonResponse({
    status: "success",
    revoked: true,
    auditLogged: auditLogged,
  });
}

function handleGetReviewerAccountStatusRequest(data) {
  var verified = verifyReviewerRequestIdentity_(data);
  if (verified.error) return verified.error;
  return jsonResponse(getReviewerAccountStatusResponse_(verified.identity));
}

function authorizeReviewerRequest_(data, bypassAccountCache, timings) {
  var identityStartedAt = Date.now();
  var verified = verifyReviewerRequestIdentity_(data);
  if (timings) timings.identityVerificationMs = Date.now() - identityStartedAt;
  if (verified.error) return { error: verified.error };
  var accountLookupStartedAt = Date.now();
  var account = findMRHAccount_(
    verified.identity.email,
    bypassAccountCache === true,
  );
  if (timings) timings.accountLookupMs = Date.now() - accountLookupStartedAt;
  if (!account || !hasCompleteReviewerProfile_(account))
    return {
      error: errorResponse(
        "Submit your profile details for administrator review before accessing these materials.",
        "ACCOUNT_PENDING",
      ),
    };
  if (account.accountStatus === "DENIED")
    return {
      error: errorResponse(
        "Invalid credentials. Please enter your correct and proper name, then resubmit for administrator review.",
        "ACCOUNT_DENIED",
      ),
    };
  if (account.accountStatus === "RESTRICTED")
    return {
      error: errorResponse(
        "Reviewer access is restricted. Contact an administrator for assistance.",
        "ACCOUNT_RESTRICTED",
      ),
    };
  if (account.accountStatus !== "TRUE")
    return {
      error: errorResponse(
        "Your profile is waiting for administrator approval. Access remains disabled until approval.",
        "ACCOUNT_PENDING",
      ),
    };
  return {
    email: verified.identity.email,
    picture: verified.identity.picture,
    account: account,
  };
}

function authorizeReviewerPdfRequest_(data, timings) {
  var authorization = authorizeReviewerRequest_(data, false, timings);
  if (authorization.error || authorization.account.rawAccountStatus !== "TRUE")
    return {
      error:
        authorization.error ||
        errorResponse(
          "PDF access requires an account explicitly approved as TRUE.",
          "ACCOUNT_PENDING",
        ),
    };
  return authorization;
}

function getReviewerEnrollmentAuditPropertyKey_(eventId) {
  return (
    MRH_REVIEWER_ENROLLMENT_AUDIT_PREFIX +
    sha256Hex(String(eventId || "").toLowerCase())
  );
}

function getPendingReviewerEnrollmentAuditRecords_(email) {
  var normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  var allProperties = getScriptProps().getProperties();
  return Object.keys(allProperties)
    .filter(function (key) {
      return key.indexOf(MRH_REVIEWER_ENROLLMENT_AUDIT_PREFIX) === 0;
    })
    .map(function (key) {
      var record;
      try {
        record = JSON.parse(allProperties[key]);
      } catch (error) {
        throw new Error("A pending reviewer audit event is malformed.");
      }
      if (
        !record ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          String(record.eventId || ""),
        ) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(record.email || "").trim()) ||
        !["prepared", "ready"].includes(record.state) ||
        !["PROFILE_UPDATED", "APPLICATION_SUBMITTED"].includes(record.event) ||
        !record.account ||
        String(record.account.email || "")
          .trim()
          .toLowerCase() !==
          String(record.email || "")
            .trim()
            .toLowerCase()
      )
        throw new Error("A pending reviewer audit event is invalid.");
      return { key: key, record: record };
    })
    .filter(function (pending) {
      return (
        !normalizedEmail ||
        pending.record.email.trim().toLowerCase() === normalizedEmail
      );
    })
    .sort(function (left, right) {
      return Number(left.record.createdAt) - Number(right.record.createdAt);
    });
}

function sameReviewerEnrollmentProfile_(record, profile) {
  return Boolean(
    record &&
    profile &&
    String(record.email || "")
      .trim()
      .toLowerCase() === profile.email &&
    String(record.lastName || "") === profile.lastName &&
    String(record.firstName || "") === profile.firstName &&
    String(record.middleInitial || "") === profile.middleInitial,
  );
}

function flushReviewerEnrollmentAudit_(pending) {
  var record = pending && pending.record;
  if (!record || record.state !== "ready")
    throw new Error("The reviewer profile audit event is not ready.");
  appendMRHAccessLog_(
    "REVIEWERS",
    record.account,
    record.eventId,
    record.event,
    false,
    true,
  );
  getScriptProps().deleteProperty(pending.key);
}

function handleReviewerEnrollmentRequest(
  data,
  requestStartedAt,
  correlationId,
) {
  var verified = verifyReviewerRequestIdentity_(data);
  if (verified.error) return verified.error;
  var lastName = cleanText(data && data.lastName, 100);
  var firstName = cleanText(data && data.firstName, 100);
  var middleInitial = cleanText(data && data.middleInitial, 10);
  if (!lastName || !firstName)
    return errorResponse("Enter your last name and first name.", "BAD_REQUEST");
  if (
    middleInitial &&
    !/^[A-Za-z]\.$/.test(middleInitial) &&
    !/^N\/A$/i.test(middleInitial)
  )
    return errorResponse(
      "Middle Initial must be one letter and a period.",
      "BAD_REQUEST",
    );
  middleInitial = /^N\/A$/i.test(middleInitial)
    ? ""
    : middleInitial.toUpperCase();
  var profile = {
    email: String(verified.identity.email || "")
      .trim()
      .toLowerCase(),
    lastName: lastName,
    firstName: firstName,
    middleInitial: middleInitial,
  };
  var pendingRecords;
  try {
    pendingRecords = getPendingReviewerEnrollmentAuditRecords_(profile.email);
  } catch (error) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("handleReviewerEnrollmentRequest"), "[handleReviewerEnrollmentRequest] Pending audit recovery failed.", { source: "migrated_structured_log", sourceLine: 3705 }, "handleReviewerEnrollmentRequest");
    return errorResponse(
      "A previous profile update has an unresolved audit record. Retry the same profile submission or contact the site administrator.",
      "AUDIT_PENDING",
    );
  }
  var preparedPending = null;
  for (
    var pendingIndex = 0;
    pendingIndex < pendingRecords.length;
    pendingIndex += 1
  ) {
    var pending = pendingRecords[pendingIndex];
    if (pending.record.state === "prepared") {
      if (!sameReviewerEnrollmentProfile_(pending.record.account, profile))
        return errorResponse(
          "A previous profile update is awaiting audit recovery. Retry that profile submission before changing it again.",
          "AUDIT_PENDING",
        );
      if (preparedPending)
        return errorResponse(
          "Multiple profile audit events need recovery. Contact the site administrator.",
          "AUDIT_PENDING",
        );
      preparedPending = pending;
      continue;
    }
    try {
      flushReviewerEnrollmentAudit_(pending);
    } catch (auditError) {
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("handleReviewerEnrollmentRequest"), "[handleReviewerEnrollmentRequest] Pending profile audit retry failed.", { source: "migrated_structured_log", sourceLine: 3737 }, "handleReviewerEnrollmentRequest");
      if (sameReviewerEnrollmentProfile_(pending.record.account, profile))
        return jsonResponse({
          status: "success",
          accountStatus: "FALSE",
          active: false,
          email: pending.record.account.email,
          lastName: pending.record.account.lastName,
          firstName: pending.record.account.firstName,
          middleInitial: pending.record.account.middleInitial,
          profileUpdated: pending.record.event === "PROFILE_UPDATED",
          auditStatus: "pending",
          message:
            "Your profile is saved, but its audit record is still pending. Retry this submission to recover the audit record.",
        });
      return errorResponse(
        "A previous profile update is saved, but its audit record is still pending. Retry that submission before changing the profile.",
        "AUDIT_PENDING",
      );
    }
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    logBackendContention_(
      "request_reviewer_enrollment",
      correlationId || (data && data.eventId),
      "ENROLLMENT_BUSY",
      data && data.appVersion,
      Number.isFinite(Number(requestStartedAt))
        ? Date.now() - Number(requestStartedAt)
        : -1,
    );
    return errorResponse(
      "Account submission is busy. Please try again.",
      "ENROLLMENT_BUSY",
    );
  }
  var response = null;
  var auditPending = null;
  try {
    var config = getReviewerAuthorizationConfig_();
    if (!config.enabled)
      return errorResponse(
        "Reviewer account authorization is not configured.",
        "FEATURE_DISABLED",
      );
    var matchingAccount = findMRHAccount_(verified.identity.email, true);
    if (matchingAccount && matchingAccount.accountStatus === "RESTRICTED")
      return errorResponse(
        "Reviewer access is restricted. Contact an administrator for assistance.",
        "ACCOUNT_RESTRICTED",
      );
    if (matchingAccount && matchingAccount.accountStatus === "DENIED")
      return errorResponse(
        "Reviewer access was denied. Contact an administrator if you believe this is a mistake.",
        "ACCOUNT_DENIED",
      );
    if (
      matchingAccount &&
      ["TRUE", "FALSE"].indexOf(matchingAccount.accountStatus) >= 0
    ) {
      var profileChanged =
        matchingAccount.lastName !== lastName ||
        matchingAccount.firstName !== firstName ||
        matchingAccount.middleInitial !== middleInitial;
      if (!profileChanged && !preparedPending)
        return jsonResponse({
          status: "success",
          accountStatus: matchingAccount.accountStatus,
          active: matchingAccount.accountStatus === "TRUE",
          email: verified.identity.email,
          lastName: matchingAccount.lastName,
          firstName: matchingAccount.firstName,
          middleInitial: matchingAccount.middleInitial,
        });
      if (!profileChanged && preparedPending) {
        auditPending = preparedPending;
        auditPending.record.state = "ready";
        setReviewerPendingAuditProperty_(auditPending.key, auditPending.record);
        response = {
          status: "success",
          accountStatus: matchingAccount.accountStatus,
          active: matchingAccount.accountStatus === "TRUE",
          email: verified.identity.email,
          lastName: matchingAccount.lastName,
          firstName: matchingAccount.firstName,
          middleInitial: matchingAccount.middleInitial,
          profileUpdated: false,
        };
      } else {
        auditPending = preparedPending || {
          key: getReviewerEnrollmentAuditPropertyKey_(data.eventId),
          record: {
            eventId: String(data.eventId).toLowerCase(),
            email: profile.email,
            event: "PROFILE_UPDATED",
            account: profile,
            state: "prepared",
            createdAt: Date.now(),
          },
        };
        if (!preparedPending)
          setReviewerPendingAuditProperty_(
            auditPending.key,
            auditPending.record,
          );
        writeMRHAccountFields_(verified.identity.email, {
          Email: verified.identity.email,
          "Last Name": lastName,
          "First Name": firstName,
          "Middle Initial": middleInitial,
          Active: "FALSE",
        });
        auditPending.record.state = "ready";
        setReviewerPendingAuditProperty_(auditPending.key, auditPending.record);
        response = {
          status: "success",
          accountStatus: "FALSE",
          active: false,
          email: verified.identity.email,
          lastName: lastName,
          firstName: firstName,
          middleInitial: middleInitial,
          profileUpdated: true,
        };
      }
    } else {
      auditPending = preparedPending || {
        key: getReviewerEnrollmentAuditPropertyKey_(data.eventId),
        record: {
          eventId: String(data.eventId).toLowerCase(),
          email: profile.email,
          event: "APPLICATION_SUBMITTED",
          account: profile,
          state: "prepared",
          createdAt: Date.now(),
        },
      };
      if (!preparedPending)
        setReviewerPendingAuditProperty_(auditPending.key, auditPending.record);
      var accountValues = {
        Email: verified.identity.email,
        "Last Name": lastName,
        "First Name": firstName,
        "Middle Initial": middleInitial,
        Active: "FALSE",
      };
      if (!matchingAccount) {
        var accountCreatedAt = getMRHLocalDateTime_();
        accountValues.Date = accountCreatedAt[0];
        accountValues.Time = accountCreatedAt[1];
      }
      writeMRHAccountFields_(
        verified.identity.email,
        accountValues,
        !matchingAccount,
      );
      auditPending.record.event = "APPLICATION_SUBMITTED";
      auditPending.record.state = "ready";
      setReviewerPendingAuditProperty_(auditPending.key, auditPending.record);
      response = {
        status: "success",
        accountStatus: "FALSE",
        active: false,
        email: verified.identity.email,
        lastName: lastName,
        firstName: firstName,
        middleInitial: middleInitial,
      };
    }
  } finally {
    lock.releaseLock();
  }
  try {
    flushReviewerEnrollmentAudit_(auditPending);
    response.auditStatus = "logged";
  } catch (auditError) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("handleReviewerEnrollmentRequest"), "[handleReviewerEnrollmentRequest] Profile saved; audit event remains pending.", { source: "migrated_structured_log", sourceLine: 3916 }, "handleReviewerEnrollmentRequest");
    response.auditStatus = "pending";
    response.message =
      "Your profile is saved, but its audit record is still pending. Retry this submission to recover the audit record.";
  }
  return jsonResponse(response);
}
function handleGetReviewerDashboardRequest(data) {
  var authorization = authorizeReviewerRequest_(data, false);
  if (authorization.error) return authorization.error;

  var folder = mrhLoggedDriveGetFolderById_(getResourceDashboardIndexFolderId_());
  var fileName = RESOURCE_DASHBOARD_INDEX_FILES.REVIEWERS;
  var files = folder.getFilesByName(fileName);
  if (!files.hasNext()) {
    var missingIndexError = new Error(
      "Resource dashboard index is missing: " + fileName,
    );
    missingIndexError.code = "REVIEWER_INDEX_MISSING";
    throw missingIndexError;
  }
  var file = files.next();
  var reviewerCacheKey =
    "mrh_reviewer_dashboard_v2_" +
    sha256Hex(
      String(file.getId()) + ":" + String(file.getLastUpdated().getTime()),
    );

  var reviewerCache = null;
  try {
    reviewerCache = CacheService.getScriptCache();
    var cachedTab = reviewerCache.get(reviewerCacheKey);
    if (cachedTab) {
      var parsedTab = JSON.parse(cachedTab);
      if (
        parsedTab &&
        Array.isArray(parsedTab.columns) &&
        Array.isArray(parsedTab.rows) &&
        parsedTab.rows.every(Array.isArray)
      )
        return jsonResponse({
          status: "success",
          email: authorization.email,
          lastName: authorization.account.lastName,
          firstName: authorization.account.firstName,
          middleInitial: authorization.account.middleInitial,
          tab: protectReviewerDashboardTab_(parsedTab),
        });
      reviewerCache.remove(reviewerCacheKey);
    }
  } catch (cacheError) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("handleGetReviewerDashboardRequest"), "[handleGetReviewerDashboardRequest] Reviewer cache read failed.", { source: "migrated_structured_log", sourceLine: 3969 }, "handleGetReviewerDashboardRequest");
  }

  var index = getResourceDashboardCombinedIndex(fileName, file);
  var reviewerTab = buildResourceDashboardTab("REVIEWERS", index);
  reviewerTab = protectReviewerDashboardTab_(reviewerTab);
  var reviewerJson = JSON.stringify(reviewerTab);
  if (reviewerJson.length <= 90000) {
    try {
      if (!reviewerCache) reviewerCache = CacheService.getScriptCache();
      reviewerCache.put(
        reviewerCacheKey,
        reviewerJson,
        MRH_REVIEWER_DASHBOARD_VERSION_CACHE_TTL_SECONDS,
      );
    } catch (cacheError) {
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("handleGetReviewerDashboardRequest"), "[handleGetReviewerDashboardRequest] Reviewer cache write failed.", { source: "migrated_structured_log", sourceLine: 3987 }, "handleGetReviewerDashboardRequest");
    }
  }
  // reviewerTab was already protected before it was cached above. A second
  // deep clone/protection pass here cannot change the already-protected links.
  return jsonResponse({
    status: "success",
    email: authorization.email,
    lastName: authorization.account.lastName,
    firstName: authorization.account.firstName,
    middleInitial: authorization.account.middleInitial,
    tab: reviewerTab,
  });
}

function protectReviewerDashboardTab_(tab) {
  var protectedTab = JSON.parse(JSON.stringify(tab));
  if (!Array.isArray(protectedTab.links)) return protectedTab;
  protectedTab.links.forEach(function (row, rowIndex) {
    if (!Array.isArray(row)) return;
    row.forEach(function (url, columnIndex) {
      var linkType = String(
        (protectedTab.linkTypes &&
          protectedTab.linkTypes[rowIndex] &&
          protectedTab.linkTypes[rowIndex][columnIndex]) ||
          "",
      ).toLowerCase();
      var protectedFileId = /^mrh-reviewer-pdf:([A-Za-z0-9_-]{10,200})$/.exec(
        String(url || ""),
      );
      var linkTitle = String(
        (protectedTab.linkTitles &&
          protectedTab.linkTitles[rowIndex] &&
          protectedTab.linkTitles[rowIndex][columnIndex]) ||
          "",
      );
      if (linkType !== "application/pdf" && !/\.pdf$/i.test(linkTitle)) return;
      if (protectedFileId) return;
      var fileId = getResourceDashboardFileId(url);
      if (!fileId)
        throw new Error(
          "Reviewer PDF index contains a link that cannot be protected.",
        );
      row[columnIndex] = "mrh-reviewer-pdf:" + fileId;
    });
  });
  return protectedTab;
}

function getReviewerPdfIndexFileMetadata_(folderId, fileName) {
  var properties = getScriptProps();
  var cachedId = String(
    properties.getProperty(MRH_REVIEWER_PDF_INDEX_FILE_ID_PROPERTY) || "",
  ).trim();

  // The stored ID is only a lookup hint, never proof of validity. Confirm the
  // current name, parent, trash state, and modification time on every request.
  // This replaces repeated folder + name-iterator + last-updated lookups with
  // one Drive metadata request on the common path.
  if (/^[A-Za-z0-9_-]{10,200}$/.test(cachedId)) {
    try {
      var metadata = Drive.Files.get(cachedId, {
        fields: "id,name,mimeType,parents,trashed,modifiedTime",
        supportsAllDrives: true,
      });
      var parents =
        metadata && Array.isArray(metadata.parents) ? metadata.parents : [];
      var modifiedTimeMs = Date.parse(
        String((metadata && metadata.modifiedTime) || ""),
      );
      if (
        metadata &&
        metadata.trashed !== true &&
        String(metadata.name || "") === fileName &&
        String(metadata.mimeType || "") !== "application/vnd.google-apps.folder" &&
        parents.indexOf(folderId) !== -1 &&
        Number.isFinite(modifiedTimeMs)
      ) {
        return {
          id: String(metadata.id || cachedId),
          modifiedTimeMs: modifiedTimeMs,
        };
      }
    } catch (cachedMetadataError) {
      // The ID may have been deleted, moved, or become inaccessible. Fall back
      // to the same folder/name discovery used by the original implementation.
    }
  }

  var folder = mrhLoggedDriveGetFolderById_(folderId);
  var files = folder.getFilesByName(fileName);
  if (!files.hasNext())
    throw new Error("Reviewer PDF index is missing: " + fileName);
  var indexFile = files.next();
  var indexFileId = String(indexFile.getId() || "");
  var modifiedTimeMsFallback = indexFile.getLastUpdated().getTime();
  if (
    !/^[A-Za-z0-9_-]{10,200}$/.test(indexFileId) ||
    !Number.isFinite(modifiedTimeMsFallback)
  )
    throw new Error("Reviewer PDF index metadata is invalid: " + fileName);
  try {
    properties.setProperty(
      MRH_REVIEWER_PDF_INDEX_FILE_ID_PROPERTY,
      indexFileId,
    );
  } catch (propertyError) {
    // The cached ID is an optimization hint only; listing continues to work.
  }
  return { id: indexFileId, modifiedTimeMs: modifiedTimeMsFallback };
}

function getReviewerPdfIndexEntries_(knownIndexMetadata) {
  var folderId = getResourceDashboardIndexFolderId_();
  var fileName = RESOURCE_DASHBOARD_INDEX_FILES.REVIEWERS;
  var indexMetadata =
    knownIndexMetadata || getReviewerPdfIndexFileMetadata_(folderId, fileName);
  var cacheKey = reviewerPdfIndexEntriesCacheKey_(indexMetadata);
  var cache = null;
  try {
    cache = CacheService.getScriptCache();
    var cachedEntries = cache.get(cacheKey);
    if (!cachedEntries) cachedEntries = cacheGetChunked(cacheKey);
    if (cachedEntries) {
      var parsedEntries = JSON.parse(cachedEntries);
      if (
        Array.isArray(parsedEntries) &&
        parsedEntries.every(function (entry) {
          return (
            entry &&
            /^[A-Za-z0-9_-]{10,200}$/.test(String(entry.fileId || "")) &&
            typeof entry.title === "string"
          );
        })
      )
        return parsedEntries;
      cache.remove(cacheKey);
    }
  } catch (cacheError) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("getReviewerPdfIndexEntries_"), "[getReviewerPdfIndexEntries_] Index cache read failed.", { source: "migrated_structured_log", sourceLine: 4131 }, "getReviewerPdfIndexEntries_");
  }

  // Only open and parse the index file when the versioned entries cache misses.
  var indexFile = mrhLoggedDriveGetFileById_(indexMetadata.id);
  var index = getResourceDashboardCombinedIndex(fileName, indexFile);
  var tab = buildResourceDashboardTab("REVIEWERS", index);
  var entries = [];
  tab.rows.forEach(function (row, rowIndex) {
    row.forEach(function (value, columnIndex) {
      var linkType = String(
        (tab.linkTypes[rowIndex] && tab.linkTypes[rowIndex][columnIndex]) || "",
      ).toLowerCase();
      var title = String(
        (tab.linkTitles[rowIndex] && tab.linkTitles[rowIndex][columnIndex]) ||
          value ||
          "",
      ).trim();
      if (linkType !== "application/pdf" && !/\.pdf$/i.test(title)) return;
      var fileId = getResourceDashboardFileId(
        tab.links[rowIndex] && tab.links[rowIndex][columnIndex],
      );
      if (!fileId)
        throw new Error("Reviewer PDF index contains an invalid Drive ID.");
      entries.push({
        fileId: fileId,
        title: title,
        row: rowIndex,
        column: columnIndex,
      });
    });
  });
  try {
    if (!cache) cache = CacheService.getScriptCache();
    var serializedEntries = JSON.stringify(entries);
    if (serializedEntries.length <= 90000) {
      cache.remove(cacheKey + "_count");
      cache.put(cacheKey, serializedEntries, CACHE_TTL_SECONDS);
    } else if (!cachePutChunked(cacheKey, serializedEntries)) {
      LoggerService.log("INFO", mrhLoggerCategoryForFunction_("getReviewerPdfIndexEntries_"), "[getReviewerPdfIndexEntries_] Index exceeded cache capacity.", { source: "migrated_structured_log", sourceLine: 4170 }, "getReviewerPdfIndexEntries_");
    }
  } catch (cacheError) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("getReviewerPdfIndexEntries_"), "[getReviewerPdfIndexEntries_] Index cache write failed.", { source: "migrated_structured_log", sourceLine: 4173 }, "getReviewerPdfIndexEntries_");
  }
  return entries;
}

function reviewerPdfIndexEntriesCacheKey_(indexMetadata) {
  return (
    "mrh_reviewer_pdf_index_v1_" +
    sha256Hex(
      String(indexMetadata.id) + ":" + String(indexMetadata.modifiedTimeMs),
    )
  );
}

function getReviewerPdfIndexEntry_(fileId, timings) {
  if (timings) timings.indexEntryCacheHit = false;
  var indexMetadata = getReviewerPdfIndexFileMetadata_(
    getResourceDashboardIndexFolderId_(),
    RESOURCE_DASHBOARD_INDEX_FILES.REVIEWERS,
  );
  var cacheKey =
    "mrh_reviewer_pdf_entry_v1_" +
    sha256Hex(reviewerPdfIndexEntriesCacheKey_(indexMetadata) + ":" + fileId);
  var cache = null;
  try {
    cache = CacheService.getScriptCache();
    var cachedEntry = cache.get(cacheKey);
    if (cachedEntry) {
      var parsedEntry = JSON.parse(cachedEntry);
      if (
        parsedEntry &&
        parsedEntry.fileId === fileId &&
        /^[A-Za-z0-9_-]{10,200}$/.test(String(parsedEntry.fileId || "")) &&
        typeof parsedEntry.title === "string"
      ) {
        if (timings) timings.indexEntryCacheHit = true;
        return parsedEntry;
      }
      cache.remove(cacheKey);
    }
  } catch (cacheError) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("getReviewerPdfIndexEntry_"), "[getReviewerPdfIndexEntry_] Entry cache read failed.", { source: "migrated_structured_log", sourceLine: 4131 }, "getReviewerPdfIndexEntry_");
  }
  var entries = getReviewerPdfIndexEntries_(indexMetadata);
  var entry = null;
  for (var entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
    if (entries[entryIndex].fileId === fileId) {
      entry = entries[entryIndex];
      break;
    }
  }
  if (!entry) return null;
  try {
    if (!cache) cache = CacheService.getScriptCache();
    cache.put(
      cacheKey,
      JSON.stringify(entry),
      MRH_REVIEWER_PDF_INDEX_ENTRY_CACHE_TTL_SECONDS_,
    );
  } catch (cacheError) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("getReviewerPdfIndexEntry_"), "[getReviewerPdfIndexEntry_] Entry cache write failed.", { source: "migrated_structured_log", sourceLine: 4173 }, "getReviewerPdfIndexEntry_");
  }
  return entry;
}

function listReviewerPdfPermissions_(fileId, timings) {
  var permissions = [];
  var pageToken = "";
  do {
    var options = {
      pageSize: 100,
      fields:
        "nextPageToken,permissions(id,type,role,emailAddress,domain,deleted,permissionDetails(inherited,inheritedFrom,permissionType,role))",
      supportsAllDrives: true,
    };
    if (pageToken) options.pageToken = pageToken;
    if (timings) {
      timings.drivePermissionCalls += 1;
      timings.drivePermissionPages += 1;
    }
    var response = Drive.Permissions.list(fileId, options);
    permissions = permissions.concat(response.permissions || []);
    pageToken = String(response.nextPageToken || "");
  } while (pageToken);
  return permissions;
}

function getReviewerPdfDriveResource_(fileId, timings) {
  if (timings) timings.driveMetadataCalls += 1;
  var file = Drive.Files.get(fileId, {
    fields:
      "id,name,mimeType,parents,driveId,trashed,size,modifiedTime,headRevisionId,md5Checksum",
    supportsAllDrives: true,
  });
  if (!file) return null;
  return {
    id: String(file.id || ""),
    name: String(file.name || ""),
    mimeType: String(file.mimeType || ""),
    driveId: String(file.driveId || ""),
    trashed: file.trashed === true,
    size: Number(file.size || 0),
    parents: (file.parents || []).map(String),
    modifiedTime: String(file.modifiedTime || ""),
    headRevisionId: String(file.headRevisionId || ""),
    md5Checksum: String(file.md5Checksum || ""),
  };
}

function getReviewerPdfDriveHierarchy_(fileId, timings, initialResource) {
  var queue = [{ id: fileId, path: [] }];
  var queueIndex = 0;
  var visitedCount = 0;
  var visited = Object.create(null);
  var resources = [];
  while (queueIndex < queue.length && visitedCount < 100) {
    var current = queue[queueIndex++];
    if (visited[current.id]) continue;
    visited[current.id] = true;
    visitedCount += 1;
    var resource =
      current.id === fileId && initialResource
        ? initialResource
        : getReviewerPdfDriveResource_(current.id, timings);
    if (!resource || resource.id !== current.id || resource.trashed)
      return { insideRoot: false, path: resources };
    var path = current.path.concat([resource]);
    resources.push(resource);
    if (resource.id === getResourcePortalRootFolderId_())
      return {
        insideRoot: path.some(function (item) {
          return (
            item.mimeType === "application/vnd.google-apps.folder" &&
            isPrivateResourceFolderName(item.name)
          );
        }),
        path: path,
      };
    resource.parents.forEach(function (parentId) {
      if (!visited[parentId]) queue.push({ id: parentId, path: path });
    });
  }
  return { insideRoot: false, path: resources };
}

function getReviewerPdfSource_(fileId, timings) {
  var indexLookupStartedAt = Date.now();
  var entry;
  try {
    entry = getReviewerPdfIndexEntry_(fileId, timings);
  } finally {
    if (timings) timings.indexLookupMs = Date.now() - indexLookupStartedAt;
  }
  if (!entry)
    return {
      error: {
        code: "RESOURCE_NOT_AUTHORIZED",
        message: "This PDF is not listed in the current Reviewer index.",
      },
    };
  var driveFile = getReviewerPdfDriveResource_(fileId, timings);
  if (
    !driveFile ||
    driveFile.id !== fileId ||
    driveFile.trashed ||
    String(driveFile.mimeType || "").toLowerCase() !== "application/pdf"
  )
    return {
      error: {
        code: "INVALID_RESOURCE",
        message: "The selected resource is not a PDF.",
      },
    };
  return {
    entry: entry,
    driveFile: driveFile,
    sourceVersion: reviewerPdfSourceVersion_(driveFile),
  };
}

function reviewerPdfSourceVersion_(driveFile) {
  return sha256Hex(
    [
      driveFile.id,
      driveFile.size,
      driveFile.modifiedTime,
      driveFile.headRevisionId,
      driveFile.md5Checksum,
      driveFile.parents.slice().sort().join(","),
    ].join("\n"),
  );
}

function sumReviewerPdfTimings_(timings, fields) {
  var total = 0;
  var measured = false;
  fields.forEach(function (field) {
    if (typeof timings[field] === "number" && Number.isFinite(timings[field])) {
      total += timings[field];
      measured = true;
    }
  });
  return measured ? total : null;
}

function reportReviewerPdfTimingFailure_(record, stage, error) {
  LoggerService.log(
    "ERROR",
    "API_CALL",
    "Reviewer PDF request timing record could not be persisted",
    {
      event: "reviewer_pdf_request_timing_log_failed",
      correlationId: String((record && record.correlationId) || "").slice(0, 80),
      stage: String(stage || "unknown").slice(0, 80),
      persistenceState: "not_persisted",
      errorName: String((error && error.name) || "Error").slice(0, 40),
    },
    "reportReviewerPdfTimingFailure_",
    error,
  );
}

function logReviewerPdfRequestTiming_(data, startedAt, timings, outcome) {
  var record = null;
  var stage = "record";
  try {
    var requestCorrelationId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String((data && data.eventId) || ""),
      )
        ? String(data.eventId).toLowerCase()
        : "";
    record = { correlationId: requestCorrelationId };
    record = {
      timestamp: new Date().toISOString(),
      environment: "production",
      event: "reviewer_pdf_request_timing",
      timingSchemaVersion: 8,
      correlationId: requestCorrelationId,
      outcome: outcome,
      failureStage: timings.failureStage || "",
      sourceCacheStatus: timings.sourceCacheStatus || "NOT_EVALUATED",
      signedDeliveryRequested: timings.signedDeliveryRequested === true,
      pdfStorageCache: timings.pdfStorageCache || "NOT_REQUESTED",
      pdfStorageLookupMs: timings.pdfStorageLookupMs,
      pdfStorageUploadMs: timings.pdfStorageUploadMs,
      driveAuthorizationCacheStatus:
        timings.driveAuthorizationCacheStatus || "NOT_EVALUATED",
      totalMs: Date.now() - startedAt,
      authorizationMs: timings.authorizationMs,
      identityVerificationMs: timings.identityVerificationMs,
      accountLookupMs: timings.accountLookupMs,
      issuanceLimitMs: timings.issuanceLimitMs,
      issuanceStoreMs: timings.issuanceStoreMs,
      issuanceLimitAllowed: timings.issuanceLimitAllowed,
      issuanceLimitLockWaitMs: null,
      issuanceLimitLockHoldMs: null,
      issuanceReferenceMs: timings.issuanceReferenceMs,
      issuanceReferenceMode: timings.issuanceReferenceMode || "NOT_EVALUATED",
      issuanceReferenceLockWaitMs: timings.issuanceReferenceLockWaitMs,
      issuanceReferenceLockHoldMs: timings.issuanceReferenceLockHoldMs,
      auditLockWaitMs: timings.auditLockWaitMs,
      auditLockHoldMs: timings.auditLockHoldMs,
      scriptLockWaitMs: sumReviewerPdfTimings_(timings, [
        "issuanceReferenceLockWaitMs",
        "auditLockWaitMs",
      ]),
      scriptLockHoldMs: sumReviewerPdfTimings_(timings, [
        "issuanceReferenceLockHoldMs",
        "auditLockHoldMs",
      ]),
      indexLookupMs: timings.indexLookupMs,
      indexEntryCacheHit: timings.indexEntryCacheHit,
      driveHierarchyMs: timings.driveHierarchyMs,
      drivePermissionMs: timings.drivePermissionMs,
      driveMetadataCalls: timings.driveMetadataCalls,
      drivePermissionCalls: timings.drivePermissionCalls,
      drivePermissionPages: timings.drivePermissionPages,
      driveAdvancedApiCalls:
        timings.driveMetadataCalls + timings.drivePermissionCalls,
      sourceReadMs: timings.sourceReadMs,
      accessLogMs: timings.accessLogMs,
      auditSheetSetupMs: timings.auditSheetSetupMs,
      auditDedupeMs: timings.auditDedupeMs,
      auditDeduplicated: timings.auditDeduplicated,
      auditAccountActivityMs: timings.auditAccountActivityMs,
      auditAppendMs: timings.auditAppendMs,
      cloudAuditLogMs: timings.cloudAuditLogMs,
      base64EncodeMs: timings.base64EncodeMs,
      responseBuildMs: timings.responseBuildMs,
      sourceBytes: timings.sourceBytes,
      responseBytes: timings.responseBytes,
      base64Bytes: timings.base64Bytes,
    };
    stage = "log";
    LoggerService.log("INFO", mrhLoggerCategoryForFunction_("logReviewerPdfRequestTiming_"), String((record && (record.message || record.event || record.activity)) || "Structured diagnostic event"), record, "logReviewerPdfRequestTiming_");
  } catch (error) {
    reportReviewerPdfTimingFailure_(record, stage, error);
  }
}

function logReviewerPdfActivity_(timings, activity, details, persistToSheet) {
  var startedAt = Date.now();
  try {
    return logStudentPortalActivity_(
      activity,
      details,
      persistToSheet === true,
    );
  } finally {
    if (timings)
      timings.cloudAuditLogMs =
        Number(timings.cloudAuditLogMs || 0) + (Date.now() - startedAt);
  }
}

function recordReviewerPdfUnauthorizedResourceAttempt_(account, fileId) {
  var email = String((account && account.email) || "").trim().toLowerCase();
  var normalizedFileId = String(fileId || "").trim();
  if (
    !account ||
    account.accountStatus !== "TRUE" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !/^[A-Za-z0-9_-]{10,200}$/.test(normalizedFileId)
  ) return false;

  var result;
  try {
    result = mrhSupabaseRpc_(MRH_SUPABASE_RATE_LIMIT_RPC, {
      p_scope: "reviewer_pdf_probe",
      p_identity_hash: sha256Hex(email),
      p_event_hash: sha256Hex(normalizedFileId),
      p_consume: true,
    });
    if (!result || typeof result.allowed !== "boolean" || typeof result.alertThresholdReached !== "boolean")
      throw new Error("Persistent Reviewer PDF probe counter returned an invalid response.");
  } catch (error) {
    LoggerService.log(
      "ERROR",
      "API_CALL",
      "Persistent Reviewer PDF probe counter failed",
      { errorName: String((error && error.name) || "Error"), errorCode: String((error && error.code) || "RATE_LIMIT_STORE_UNAVAILABLE") },
      "recordReviewerPdfUnauthorizedResourceAttempt_",
      error,
    );
    return false;
  }
  if (result.alertThresholdReached !== true) return false;

  // The database tracks the threshold atomically; this short critical section
  // makes the account-state transition and audit append single-writer per script.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    LoggerService.log("WARN", "AUTH", "Reviewer account restriction deferred because the transition lock is busy", {
      accountHash: sha256Hex(email),
      distinctUnauthorizedResources: Number(result.distinctCount) || REVIEWER_PDF_SUSPICIOUS_RESOURCE_LIMIT_,
    }, "recordReviewerPdfUnauthorizedResourceAttempt_");
    return false;
  }

  var accountRestricted = false;
  try {
    var config = getReviewerAuthorizationConfig_();
    var currentAccount = findMRHAccount_(email, true);
    if (
      !currentAccount ||
      currentAccount.accountStatus !== "TRUE" ||
      !hasCompleteReviewerProfile_(currentAccount)
    ) return false;

    writeMRHAccountFields_(email, { Active: "RESTRICTED" });
    accountRestricted = true;
    invalidateMRHAccountCache_(config.storeId, email);
    var eventId = String(Utilities.getUuid() || "").toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId))
      throw new Error("The automatic restriction audit ID is invalid.");
    appendMRHAccessLog_("REVIEWERS", currentAccount, eventId, "AUTO_RESTRICTED", true, true, null);
    LoggerService.log("WARN", "AUTH", "Reviewer account automatically restricted after repeated unauthorized resource probes", {
      accountHash: sha256Hex(email),
      distinctUnauthorizedResources: Number(result.distinctCount) || REVIEWER_PDF_SUSPICIOUS_RESOURCE_LIMIT_,
      windowMs: REVIEWER_PDF_SUSPICIOUS_RESOURCE_WINDOW_MS_,
    }, "recordReviewerPdfUnauthorizedResourceAttempt_");
  } catch (error) {
    LoggerService.log(
      "ERROR",
      "AUTH",
      "Reviewer account automatic restriction failed",
      { accountHash: sha256Hex(email), errorName: String((error && error.name) || "Error") },
      "recordReviewerPdfUnauthorizedResourceAttempt_",
      error,
    );
  } finally {
    lock.releaseLock();
  }

  if (accountRestricted) {
    writeCentralWebAppLog_({
      severity: "WARN",
      event: "reviewer_account_auto_restricted",
      outcome: "restricted",
      method: "SYSTEM",
      requestType: "reviewer_security_event",
      activity: "AUTO_RESTRICTED",
      responseCode: "AUTO_RESTRICTED",
    });
  }
  return accountRestricted;
}

function reviewerPdfFailure_(
  data,
  startedAt,
  code,
  message,
  timings,
  activityAlreadyLogged,
) {
  if (!activityAlreadyLogged)
    logReviewerPdfActivity_(timings, "PDF_ISSUANCE_DENIED", {
      requestType: "get_reviewer_pdf_preview",
      correlationId: data && data.eventId,
      resourceId: data && data.fileId,
      resourceArea: "REVIEWERS",
      outcome: "failure",
      responseCode: code,
    });
  if (timings) timings.outcome = code;
  return errorResponse(message, code);
}

function reviewerPdfDownloadName_(
  fileName,
  firstName,
  lastName,
  issuanceReference,
) {
  var title = String(fileName || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, " ")
    .replace(/\breviewers?\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\.pdf$/i, "")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 140);
  var safeFirstName = String(firstName || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
  var safeLastName = String(lastName || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
  var referenceParts = /^MRH-\d{4}-(\d{4})$/.exec(
    String(issuanceReference || ""),
  );
  if (!safeFirstName || !safeLastName || !referenceParts) return "";
  return (
    "[" +
    referenceParts[1] +
    "] " +
    (title || "PDF") +
    " (" +
    safeLastName.toUpperCase() +
    ", " +
    safeFirstName.toUpperCase() +
    ").pdf"
  );
}

function createReviewerPdfIssuanceReference_() {
  var uuid = String(Utilities.getUuid() || "")
    .replace(/-/g, "")
    .toUpperCase();
  if (!/^[A-F0-9]{12}4[A-F0-9]{3}[89AB][A-F0-9]{15}$/.test(uuid))
    throw new Error("A unique protected-PDF reference could not be generated.");
  var compactDigits = String(
    parseInt(sha256Hex(uuid).substring(0, 12), 16) % 100000000,
  ).padStart(8, "0");
  return (
    "MRH-" + compactDigits.substring(0, 4) + "-" + compactDigits.substring(4)
  );
}

function hasReviewerPdfSignature_(sourceBytes) {
  if (
    !sourceBytes ||
    !Number.isSafeInteger(sourceBytes.length) ||
    sourceBytes.length < 5
  )
    return false;
  var lastStart = Math.min(sourceBytes.length - 5, 1019);
  for (var offset = 0; offset <= lastStart; offset += 1) {
    if (
      (sourceBytes[offset] & 255) === 37 &&
      (sourceBytes[offset + 1] & 255) === 80 &&
      (sourceBytes[offset + 2] & 255) === 68 &&
      (sourceBytes[offset + 3] & 255) === 70 &&
      (sourceBytes[offset + 4] & 255) === 45
    )
      return true;
  }
  return false;
}

function checkReviewerPdfIssuanceLimit_(
  email,
  fileId,
  correlationId,
  reviewerPdfTimings,
) {
  var startedAt = Date.now();
  try {
    var result = checkReviewerPdfIssuanceLimitInternal_(
      email,
      fileId,
      correlationId,
      reviewerPdfTimings,
    );
    if (reviewerPdfTimings)
      reviewerPdfTimings.issuanceLimitAllowed = result.allowed === true;
    return result;
  } finally {
    if (reviewerPdfTimings)
      reviewerPdfTimings.issuanceLimitMs = Date.now() - startedAt;
  }
}

function checkReviewerPdfIssuanceLimitInternal_(
  email,
  fileId,
  correlationId,
  reviewerPdfTimings,
) {
  var normalizedEmail = String(email || "").trim().toLowerCase();
  var normalizedFileId = String(fileId || "");
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
    !/^[A-Za-z0-9_-]{10,200}$/.test(normalizedFileId)
  )
    throw new Error("Reviewer PDF issuance limits require verified request details.");

  var startedAt = Date.now();
  var result;
  try {
    result = mrhSupabaseRpc_(MRH_SUPABASE_RATE_LIMIT_RPC, {
      p_scope: "reviewer_pdf",
      p_identity_hash: sha256Hex(normalizedEmail),
      p_event_hash: sha256Hex(normalizedFileId),
      p_consume: true,
    });
    if (!result || typeof result.allowed !== "boolean")
      throw new Error("Persistent PDF rate-limit service returned an invalid response.");
  } catch (error) {
    LoggerService.log(
      "ERROR",
      "API_CALL",
      "Persistent Reviewer PDF rate-limit check failed closed",
      { errorName: String((error && error.name) || "Error"), errorCode: String((error && error.code) || "RATE_LIMIT_STORE_UNAVAILABLE") },
      "checkReviewerPdfIssuanceLimitInternal_",
      error,
    );
    if (reviewerPdfTimings) {
      reviewerPdfTimings.issuanceStoreMs = Date.now() - startedAt;
      // Retain the legacy timing field for existing monitoring consumers.
      reviewerPdfTimings.issuanceLockWaitMs = 0;
    }
    logReviewerPdfActivity_(reviewerPdfTimings, "PDF_RATE_LIMIT_CHECK_FAILED", {
      requestType: "get_reviewer_pdf_preview",
      correlationId: correlationId,
      verifiedAccountEmail: normalizedEmail,
      resourceId: normalizedFileId,
      resourceArea: "REVIEWERS",
      outcome: "failure",
      responseCode: "TEMPORARY_UNAVAILABLE",
      detail: "persistent_rate_limit_store",
    });
    return {
      allowed: false,
      code: "TEMPORARY_UNAVAILABLE",
      message: "The protected PDF service is temporarily unavailable. Please try again.",
    };
  }

  if (reviewerPdfTimings) {
    reviewerPdfTimings.issuanceStoreMs = Date.now() - startedAt;
    reviewerPdfTimings.issuanceLockWaitMs = 0;
    reviewerPdfTimings.issuanceLimitAllowed = result.allowed === true;
  }

  if (result.allowed !== true) {
    var reason = String(result.reason || "request_window");
    var distinctLimit = reason === "distinct_window";
    logReviewerPdfActivity_(reviewerPdfTimings, "PDF_RATE_LIMITED", {
      requestType: "get_reviewer_pdf_preview",
      correlationId: correlationId,
      verifiedAccountEmail: normalizedEmail,
      resourceId: normalizedFileId,
      resourceArea: "REVIEWERS",
      outcome: "failure",
      responseCode: "RATE_LIMITED",
      detail: distinctLimit ? "20_distinct_documents_in_1_hour" : "30_issuances_in_10_minutes",
    });
    return {
      allowed: false,
      code: "RATE_LIMITED",
      message: distinctLimit
        ? "You have reached the hourly limit for distinct Reviewer PDFs."
        : "Too many PDF requests. Please wait a few minutes and try again.",
    };
  }

  if (result.alertThresholdReached === true) {
    logReviewerPdfActivity_(reviewerPdfTimings, "PDF_ISSUANCE_ALERT_THRESHOLD", {
      requestType: "get_reviewer_pdf_preview",
      correlationId: correlationId,
      verifiedAccountEmail: normalizedEmail,
      resourceId: normalizedFileId,
      resourceArea: "REVIEWERS",
      outcome: "success",
      responseCode: "ALERT_THRESHOLD_REACHED",
      detail: "12_distinct_documents_in_1_hour",
    });
  }
  return { allowed: true, code: "", message: "" };
}

function handleGetReviewerPdfPreviewRequest_(data) {
  var startedAt = Date.now();
  var timings = {
    failureStage: "request",
    sourceCacheStatus: "NOT_EVALUATED",
    authorizationMs: null,
    identityVerificationMs: null,
    accountLookupMs: null,
    issuanceLimitMs: null,
    issuanceStoreMs: null,
    issuanceLimitAllowed: null,
    issuanceReferenceMs: null,
    issuanceReferenceMode: "NOT_EVALUATED",
    issuanceReferenceLockWaitMs: null,
    issuanceReferenceLockHoldMs: null,
    indexLookupMs: null,
    indexEntryCacheHit: null,
    driveHierarchyMs: null,
    drivePermissionMs: null,
    driveAuthorizationCacheStatus: "SKIPPED",
    driveMetadataCalls: 0,
    drivePermissionCalls: 0,
    drivePermissionPages: 0,
    sourceReadMs: null,
    accessLogMs: null,
    auditLockWaitMs: null,
    auditLockHoldMs: null,
    auditSheetSetupMs: null,
    auditDedupeMs: null,
    auditDeduplicated: null,
    auditAccountActivityMs: null,
    auditAppendMs: null,
    cloudAuditLogMs: null,
    base64EncodeMs: null,
    responseBuildMs: null,
    sourceBytes: null,
    responseBytes: null,
    base64Bytes: 0,
  };
  try {
    var response = handleGetReviewerPdfPreviewRequestCore_(
      data,
      startedAt,
      timings,
    );
    if (timings.sourceCacheStatus === "VERSION_MATCH")
      timings.sourceCacheStatus = "MATCHED_NOT_DELIVERED";
    if (!timings.outcome)
      timings.outcome =
        response && response.code ? String(response.code) : "REQUEST_FAILED";
    if (
      timings.outcome === "CACHED_AUTHORIZED_SOURCE_REUSED" ||
      timings.outcome === "AUTHORIZED_SOURCE_DELIVERED"
    )
      timings.failureStage = "";
    return response;
  } catch (error) {
    if (timings.sourceCacheStatus === "VERSION_MATCH")
      timings.sourceCacheStatus = "MATCHED_NOT_DELIVERED";
    if (!timings.outcome) timings.outcome = "UNHANDLED_EXCEPTION";
    throw error;
  } finally {
    logReviewerPdfRequestTiming_(
      data,
      startedAt,
      timings,
      timings.outcome || "UNHANDLED_EXCEPTION",
    );
  }
}

function handleGetReviewerPdfPreviewRequestCore_(data, startedAt, timings) {
  timings.failureStage = "authorization";
  var authorizationStartedAt = Date.now();
  var authorization;
  try {
    authorization = authorizeReviewerPdfRequest_(data, timings);
  } catch (error) {
    timings.authorizationMs = Date.now() - authorizationStartedAt;
    logReviewerPdfActivity_(timings, "PDF_ISSUANCE_DENIED", {
      requestType: "get_reviewer_pdf_preview",
      correlationId: data && data.eventId,
      resourceId: data && data.fileId,
      resourceArea: "REVIEWERS",
      outcome: "failure",
      responseCode: "AUTHORIZATION_FAILED",
    });
    timings.outcome = "AUTHORIZATION_FAILED";
    throw error;
  }
  timings.authorizationMs = Date.now() - authorizationStartedAt;
  if (authorization.error) {
    logReviewerPdfActivity_(timings, "PDF_ISSUANCE_DENIED", {
      requestType: "get_reviewer_pdf_preview",
      correlationId: data && data.eventId,
      resourceId: data && data.fileId,
      resourceArea: "REVIEWERS",
      outcome: "failure",
      responseCode: getCentralLogErrorCode_(authorization.error),
    });
    timings.outcome =
      getCentralLogErrorCode_(authorization.error) || "AUTHORIZATION_FAILED";
    return authorization.error;
  }
  timings.failureStage = "request_validation";
  var fileId = String((data && data.fileId) || "").trim();
  var issuancePurpose = String((data && data.issuancePurpose) || "PREVIEW")
    .trim()
    .toUpperCase();
  if (issuancePurpose !== "PREVIEW" && issuancePurpose !== "DOWNLOAD")
    return reviewerPdfFailure_(
      data,
      startedAt,
      "BAD_REQUEST",
      "The PDF issuance purpose is invalid.",
      timings,
    );
  var cachedSourceVersion = String((data && data.cachedSourceVersion) || "");
  if (cachedSourceVersion && !/^[a-f0-9]{64}$/i.test(cachedSourceVersion))
    return reviewerPdfFailure_(
      data,
      startedAt,
      "BAD_REQUEST",
      "The cached PDF source version is invalid.",
      timings,
    );
  var cachedSignedSourceAvailable =
    data && data.cachedSignedSourceAvailable === true;
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId))
    return reviewerPdfFailure_(
      data,
      startedAt,
      "BAD_REQUEST",
      "A valid PDF ID is required.",
      timings,
    );
  var source;
  timings.failureStage = "source_validation";
  try {
    source = getReviewerPdfSource_(fileId, timings);
  } catch (error) {
    timings.outcome = "SOURCE_LOOKUP_FAILED";
    throw error;
  }
  if (source.error) {
    if (
      source.error.code === "RESOURCE_NOT_AUTHORIZED" &&
      recordReviewerPdfUnauthorizedResourceAttempt_(
        authorization.account,
        fileId,
      )
    )
      return reviewerPdfFailure_(
        data,
        startedAt,
        "ACCOUNT_RESTRICTED",
        "Reviewer access has been restricted. Contact an administrator for assistance.",
        timings,
      );
    return reviewerPdfFailure_(
      data,
      startedAt,
      source.error.code,
      source.error.message,
      timings,
    );
  }
  timings.sourceBytes = Number(source.driveFile.size || 0);
  if (timings.sourceBytes > REVIEWER_PDF_MAX_SOURCE_BYTES_)
    return reviewerPdfFailure_(
      data,
      startedAt,
      "FILE_TOO_LARGE",
      "This protected PDF exceeds the 16 MiB delivery limit.",
      timings,
    );
  var preferSignedUrl = reviewerPdfSignedDeliveryRequested_(data);
  timings.signedDeliveryRequested = preferSignedUrl;
  var signedPdfUrl = "";
  var shouldAttemptStorageUpload = false;
  // The legacy browser-cache contract is kept for old clients. Signed-URL
  // clients instead use the server-side versioned Storage object cache.
  var reuseCachedSource = !preferSignedUrl && cachedSourceVersion !== "" &&
    cachedSourceVersion.toLowerCase() ===
      String(source.sourceVersion || "").toLowerCase() &&
    Number.isSafeInteger(timings.sourceBytes) &&
    timings.sourceBytes >= 5;
  var reuseCachedSignedSource =
    preferSignedUrl &&
    cachedSignedSourceAvailable &&
    cachedSourceVersion !== "" &&
    cachedSourceVersion.toLowerCase() ===
      String(source.sourceVersion || "").toLowerCase() &&
    Number.isSafeInteger(timings.sourceBytes) &&
    timings.sourceBytes >= 5;
  reuseCachedSource = reuseCachedSource || reuseCachedSignedSource;
  timings.sourceCacheStatus = reuseCachedSignedSource
    ? "CLIENT_CACHE_HIT"
    : preferSignedUrl
      ? "STORAGE_PENDING"
      : !cachedSourceVersion
        ? "NOT_REQUESTED"
        : reuseCachedSource
          ? "VERSION_MATCH"
          : "MISS";
  if (reuseCachedSignedSource)
    timings.pdfStorageCache = "CLIENT_CACHE_HIT";
  timings.failureStage = "issuance_limit";
  var issuanceLimit = checkReviewerPdfIssuanceLimit_(
    authorization.email,
    fileId,
    data && data.eventId,
    timings,
  );
  if (!issuanceLimit.allowed)
    return reviewerPdfFailure_(
      data,
      startedAt,
      issuanceLimit.code,
      issuanceLimit.message,
      timings,
      true,
    );
  var fullName = [
    authorization.account.firstName,
    authorization.account.middleInitial,
    authorization.account.lastName,
  ]
    .map(function (part) {
      return String(part || "").trim();
    })
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authorization.email) || !fullName) {
    return reviewerPdfFailure_(
      data,
      startedAt,
      "BAD_REQUEST",
      "Verified account details are required.",
      timings,
    );
  }
  var issuanceReference;
  timings.failureStage = "issuance_reference";
  try {
    issuanceReference = getOrCreateReviewerPdfIssuanceReference_(
      authorization.account,
      getReviewerAuthorizationConfig_().storeId,
      timings,
    );
  } catch (error) {
    if (error && error.code === "TEMPORARY_UNAVAILABLE")
      return reviewerPdfFailure_(
        data,
        startedAt,
        "TEMPORARY_UNAVAILABLE",
        "PDF preparation is temporarily busy. Please try again shortly.",
        timings,
      );
    throw error;
  }
  var downloadFileName = reviewerPdfDownloadName_(
    source.entry.title,
    authorization.account.firstName,
    authorization.account.lastName,
    issuanceReference,
  );
  if (!downloadFileName)
    return reviewerPdfFailure_(
      data,
      startedAt,
      "BAD_REQUEST",
      "Verified account and resource names are required.",
      timings,
    );
  var issuanceLogEventId = String(Utilities.getUuid() || "").toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      issuanceLogEventId,
    )
  )
    throw new Error(
      "A unique protected-PDF audit event could not be generated.",
    );
  if (preferSignedUrl && !reuseCachedSignedSource) {
    var storageSignStartedAt = Date.now();
    try {
      signedPdfUrl = createReviewerPdfStorageSignedUrl_(
        fileId, source.sourceVersion, downloadFileName, issuancePurpose,
      );
      timings.pdfStorageCache = "HIT";
      timings.sourceCacheStatus = "STORAGE_HIT";
    } catch (storageSignMiss) {
      // Supabase Storage currently reports a missing object as a client error
      // (commonly HTTP 400; some deployments return 404). Only those responses
      // trigger an upload attempt. Auth, rate-limit, server, network, and invalid
      // response failures skip the extra upload round-trip and fall back to the
      // current authenticated Base64 contract after reading the source.
      shouldAttemptStorageUpload = Boolean(
        storageSignMiss &&
        (Number(storageSignMiss.httpStatus) === 400 || Number(storageSignMiss.httpStatus) === 404)
      );
      timings.pdfStorageCache = shouldAttemptStorageUpload ? "MISS" : "ERROR";
    }
    timings.pdfStorageLookupMs = (timings.pdfStorageLookupMs || 0) + Date.now() - storageSignStartedAt;
  }
  var sourceBytes = null;
  timings.failureStage = "source_read";
  if (!reuseCachedSource && !signedPdfUrl) {
    var sourceReadStartedAt = Date.now();
    try {
      sourceBytes = mrhLoggedDriveGetFileById_(fileId).getBlob().getBytes();
    } catch (error) {
      timings.sourceReadMs = Date.now() - sourceReadStartedAt;
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("handleGetReviewerPdfPreviewRequestCore_"), "reviewer_pdf_source_read_failed", {
          event: "reviewer_pdf_source_read_failed",
          correlationId: String(data.eventId || ""),
          errorName: String((error && error.name) || "Error"),
          durationMs: Date.now() - startedAt,
        }, "handleGetReviewerPdfPreviewRequestCore_");
      return reviewerPdfFailure_(
        data,
        startedAt,
        "PDF_SOURCE_UNAVAILABLE",
        "The authorized PDF source could not be read. Please try again.",
        timings,
      );
    }
    timings.sourceReadMs = Date.now() - sourceReadStartedAt;
    timings.sourceBytes = sourceBytes.length;
    if (sourceBytes.length > REVIEWER_PDF_MAX_SOURCE_BYTES_)
      return reviewerPdfFailure_(
        data,
        startedAt,
        "FILE_TOO_LARGE",
        "This protected PDF exceeds the 16 MiB delivery limit.",
        timings,
      );
    if (!hasReviewerPdfSignature_(sourceBytes))
      return reviewerPdfFailure_(
        data,
        startedAt,
        "INVALID_PDF",
        "The source file is not a valid PDF.",
        timings,
      );
  }
  if (preferSignedUrl && shouldAttemptStorageUpload && !signedPdfUrl && sourceBytes) {
    var storageUploadStartedAt = Date.now();
    try {
      signedPdfUrl = uploadReviewerPdfAndCreateSignedUrl_(
        fileId, source.sourceVersion, sourceBytes, downloadFileName, issuancePurpose,
      );
      timings.pdfStorageCache = "UPLOADED";
      timings.sourceCacheStatus = "STORAGE_UPLOADED";
    } catch (storageUploadError) {
      // Roll back to the original delivery contract if Storage is not ready.
      // Never expose a public Drive URL or return an unverified storage path.
      timings.pdfStorageCache = "FALLBACK_BASE64";
      timings.sourceCacheStatus = "FALLBACK_BASE64";
      LoggerService.log("WARN", mrhLoggerCategoryForFunction_("handleGetReviewerPdfPreviewRequestCore_"), "Private PDF Storage unavailable; using the existing authenticated response contract", {
        event: "reviewer_pdf_storage_delivery_fallback",
        correlationId: String(data.eventId || ""),
        errorCode: String((storageUploadError && storageUploadError.code) || "SUPABASE_PDF_STORAGE_FAILED"),
      }, "handleGetReviewerPdfPreviewRequestCore_");
      signedPdfUrl = "";
    } finally {
      timings.pdfStorageUploadMs = Date.now() - storageUploadStartedAt;
    }
  }
  timings.failureStage = "audit";
  var accessLogStartedAt = Date.now();
  try {
    var auditAccount = Object.assign({}, authorization.account, {
      email: authorization.email,
      permanentPdfIssuanceId: issuanceReference,
    });
    appendMRHAccessLog_(
      "REVIEWERS",
      auditAccount,
      issuanceLogEventId,
      {
        event:
          issuancePurpose === "DOWNLOAD"
            ? "PROTECTED_PDF_DOWNLOAD_ISSUED"
            : "PROTECTED_PDF_VIEW",
        course: cleanText(data && data.course, 160),
        year: cleanText(data && data.year, 40),
        semester: cleanText(data && data.semester, 40),
        category: cleanText(data && data.category, 40) || "REVIEWERS",
        issuanceReference: issuanceReference,
        sourceFileId: fileId,
        resource:
          cleanText(data && data.courseName, 160) ||
          extractResourceCourseName_(source.entry.title) ||
          cleanText(data && data.course, 160),
      },
      false,
      false,
      timings,
      null,
      { trustedAccount: true, freshEventId: true },
    );
    logReviewerPdfActivity_(
      timings,
      issuancePurpose === "DOWNLOAD"
        ? "PROTECTED_PDF_DOWNLOAD_ISSUED"
        : "PROTECTED_PDF_VIEW",
      {
        requestType: "get_reviewer_pdf_preview",
        correlationId: data && data.eventId,
        verifiedAccountEmail: authorization.email,
        resourceId: fileId,
        resourceName: source.entry.title,
        resourceArea: "REVIEWERS",
        issuanceReference: issuanceReference,
        auditEventId: issuanceLogEventId,
      },
    );
    timings.accessLogMs = Date.now() - accessLogStartedAt;
  } catch (error) {
    timings.accessLogMs = Date.now() - accessLogStartedAt;
    if (error && error.code === "TEMPORARY_UNAVAILABLE")
      return reviewerPdfFailure_(
        data,
        startedAt,
        "TEMPORARY_UNAVAILABLE",
        "The PDF preview is temporarily busy. Please try again shortly.",
        timings,
      );
    timings.outcome = "ACCESS_LOG_FAILED";
    throw error;
  }
  var encodedSource = "";
  timings.failureStage = "base64_encode";
  if (!reuseCachedSource && !signedPdfUrl) {
    var base64EncodeStartedAt = Date.now();
    encodedSource = Utilities.base64Encode(sourceBytes);
    timings.base64EncodeMs = Date.now() - base64EncodeStartedAt;
    timings.base64Bytes = encodedSource.length;
  }
  timings.failureStage = "response_build";
  var responseBuildStartedAt = Date.now();
  var responsePayload = {
    status: "success",
    mimeType: "application/pdf",
    sourceVersion: source.sourceVersion,
    fullName: fullName,
    firstName: authorization.account.firstName,
    lastName: authorization.account.lastName,
    email: authorization.email,
    downloadFileName: downloadFileName,
    issuanceReference: issuanceReference,
    deliveryMode: signedPdfUrl
      ? "signed-url"
      : reuseCachedSource
        ? "cached-authorized-source"
        : "authorized-source",
    data: "",
    sourceByteLength: (signedPdfUrl || reuseCachedSource)
      ? timings.sourceBytes
      : sourceBytes.length,
  };
  // Preserve the exact legacy response shape for clients that did not negotiate
  // signed delivery. The new fields appear only when the signed-url mode is used.
  if (signedPdfUrl) {
    responsePayload.signedUrl = signedPdfUrl;
    responsePayload.signedUrlExpiresInSeconds = MRH_PDF_SIGNED_URL_TTL_SECONDS_;
  }
  var responseWithoutPdfData = JSON.stringify(responsePayload);
  timings.responseBytes =
    Utilities.newBlob(responseWithoutPdfData).getBytes().length +
    encodedSource.length;
  if (timings.responseBytes > REVIEWER_PDF_MAX_RESPONSE_BYTES_)
    return reviewerPdfFailure_(
      data,
      startedAt,
      "FILE_TOO_LARGE",
      "This protected PDF exceeds the supported delivery response limit.",
      timings,
      true,
    );
  responsePayload.data = encodedSource;
  // Splice the base64 into the already-serialized envelope instead of
  // stringifying a ~20 MB value a second time. Base64 needs no JSON escaping,
  // and `"data":""` can only be the real key (quotes inside values are escaped).
  var serializedResponse = signedPdfUrl
    ? responseWithoutPdfData
    : responseWithoutPdfData.replace(
        '"data":""',
        function () { return '"data":"' + encodedSource + '"'; },
      );
  timings.responseBuildMs = Date.now() - responseBuildStartedAt;
  timings.outcome = signedPdfUrl
    ? "SIGNED_URL_DELIVERED"
    : reuseCachedSource
      ? "CACHED_AUTHORIZED_SOURCE_REUSED"
      : "AUTHORIZED_SOURCE_DELIVERED";
  if (reuseCachedSource) timings.sourceCacheStatus = "HIT";
  timings.failureStage = "";
  LoggerService.log("INFO", mrhLoggerCategoryForFunction_("handleGetReviewerPdfPreviewRequestCore_"), "Structured diagnostic event", {
      event: signedPdfUrl
        ? "reviewer_pdf_signed_url_delivered"
        : reuseCachedSource
          ? "reviewer_pdf_cached_source_reused"
          : "reviewer_pdf_authorized_source_delivered",
      correlationId: String(data.eventId || ""),
      durationMs: Date.now() - startedAt,
      sourceBytes: timings.sourceBytes,
      responseBytes: timings.responseBytes,
    }, "handleGetReviewerPdfPreviewRequestCore_");
  return ContentService.createTextOutput(serializedResponse).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function processReviewerPdfQueue() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { status: "disabled" };
  try {
    ScriptApp.getProjectTriggers().forEach(function (trigger) {
      if (trigger.getHandlerFunction() === "processReviewerPdfQueue")
        ScriptApp.deleteTrigger(trigger);
    });
  } finally {
    lock.releaseLock();
  }
  return { status: "disabled" };
}

function auditReviewerPdfDrivePermissions() {
  var entries = getReviewerPdfIndexEntries_();
  var files = Object.create(null);
  entries.forEach(function (entry) {
    var hierarchy = getReviewerPdfDriveHierarchy_(entry.fileId);
    hierarchy.path.forEach(function (item, itemIndex) {
      if (!files[item.id]) {
        files[item.id] = {
          id: item.id,
          name: item.name,
          mimeType: item.mimeType,
          insideRoot: hierarchy.insideRoot,
          reviewerTitles: [],
          ancestorIds: [],
        };
      }
      if (
        item.id === entry.fileId &&
        files[item.id].reviewerTitles.indexOf(entry.title) < 0
      )
        files[item.id].reviewerTitles.push(entry.title);
      if (!hierarchy.insideRoot) files[item.id].insideRoot = false;
      files[item.id].ancestorIds = hierarchy.path
        .slice(itemIndex + 1)
        .map(function (resource) {
          return resource.id;
        });
    });
  });
  var reportFiles = Object.keys(files).map(function (fileId) {
    var file = files[fileId];
    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      insideRoot: file.insideRoot,
      reviewerTitles: file.reviewerTitles,
      _ancestorIds: file.ancestorIds,
      permissions: listReviewerPdfPermissions_(fileId).map(
        function (permission) {
          var details = permission.permissionDetails || [];
          return {
            id: String(permission.id || ""),
            type: String(permission.type || ""),
            role: String(permission.role || ""),
            emailAddress: String(permission.emailAddress || ""),
            domain: String(permission.domain || ""),
            deleted: permission.deleted === true,
            inherited: details.some(function (detail) {
              return detail.inherited === true;
            }),
            inheritedFrom: details
              .map(function (detail) {
                return String(detail.inheritedFrom || "");
              })
              .filter(Boolean),
            permissionDetails: details,
          };
        },
      ),
    };
  });
  var permissionIndexes = Object.create(null);
  reportFiles.forEach(function (file) {
    permissionIndexes[file.id] = Object.create(null);
    file.permissions.forEach(function (permission) {
      permissionIndexes[file.id][permission.id] = permission;
    });
  });
  reportFiles.forEach(function (file) {
    file.permissions.forEach(function (permission) {
      if (permission.inherited) return;
      var inheritedFrom = file._ancestorIds.filter(function (ancestorId) {
        return Boolean(
          permissionIndexes[ancestorId] &&
          permissionIndexes[ancestorId][permission.id],
        );
      });
      if (inheritedFrom.length) {
        permission.inherited = true;
        permission.inheritedFrom = inheritedFrom;
      }
    });
    delete file._ancestorIds;
  });
  var report = {
    scope: "Reviewer PDFs and their ancestor folders only",
    protectedRootId: getResourcePortalRootFolderId_(),
    preservePrincipalsConfigured: Boolean(
      PropertiesService.getScriptProperties().getProperty(
        MRH_REVIEWER_ACL_PRESERVE_PRINCIPALS_PROPERTY,
      ),
    ),
    files: reportFiles,
  };
  LoggerService.log("INFO", mrhLoggerCategoryForFunction_("auditReviewerPdfDrivePermissions"), "reviewer_pdf_acl_dry_run", {
      event: "reviewer_pdf_acl_dry_run",
      protectedRootId: getResourcePortalRootFolderId_(),
      fileCount: reportFiles.length,
    }, "auditReviewerPdfDrivePermissions");
  reportFiles.forEach(function (file) {
    LoggerService.log("INFO", mrhLoggerCategoryForFunction_("auditReviewerPdfDrivePermissions"), "REVIEWER_PDF_ACL_REPORT " + JSON.stringify(file), { source: "migrated_structured_log", sourceLine: 5547 }, "auditReviewerPdfDrivePermissions");
  });
  return report;
}

function applyReviewedReviewerPdfPermissionRevocations(
  reviewedPermissions,
  confirmation,
  dryRun,
) {
  var isDryRun = dryRun !== false;
  if (!isDryRun && confirmation !== "REVOKE THE REVIEWED REVIEWER PDF SHARES")
    throw new Error("Explicit ACL revocation confirmation is required.");
  if (!Array.isArray(reviewedPermissions) || !reviewedPermissions.length)
    throw new Error("Provide the exact reviewed file and permission IDs.");
  var preserveSetting = String(
    PropertiesService.getScriptProperties().getProperty(
      MRH_REVIEWER_ACL_PRESERVE_PRINCIPALS_PROPERTY,
    ) || "",
  );
  var preserve = preserveSetting
    .split(/[,\s;]+/)
    .filter(Boolean)
    .map(function (email) {
      return email.toLowerCase();
    });
  var effectiveEmail = String(
    Session.getEffectiveUser().getEmail() || "",
  ).toLowerCase();
  if (
    !preserveSetting ||
    !effectiveEmail ||
    preserve.indexOf(effectiveEmail) < 0
  )
    throw new Error(
      "Configure the ACL preserve-principals property, including the Apps Script execution identity, before revocation.",
    );
  var report = auditReviewerPdfDrivePermissions();
  var permissionsByKey = Object.create(null);
  report.files.forEach(function (file) {
    file.permissions.forEach(function (permission) {
      permissionsByKey[file.id + ":" + permission.id] = {
        file: file,
        permission: permission,
      };
    });
  });
  var pendingRevocations = [];
  var seenRevocations = Object.create(null);
  reviewedPermissions.forEach(function (reviewed) {
    var fileId = String((reviewed && reviewed.fileId) || "");
    var permissionId = String((reviewed && reviewed.permissionId) || "");
    var key = fileId + ":" + permissionId;
    if (seenRevocations[key])
      throw new Error("A permission was listed for revocation more than once.");
    seenRevocations[key] = true;
    var record = permissionsByKey[fileId + ":" + permissionId];
    if (!record)
      throw new Error("A reviewed permission no longer exists in the audit.");
    if (record.permission.deleted)
      throw new Error("A deleted permission cannot be revoked again.");
    if (record.permission.inherited)
      throw new Error(
        "Inherited access must be reviewed and changed at its source folder.",
      );
    if (record.permission.role === "owner")
      throw new Error("Owner permissions cannot be revoked by this workflow.");
    if (
      record.permission.emailAddress &&
      preserve.indexOf(record.permission.emailAddress.toLowerCase()) >= 0
    )
      throw new Error("A configured protected principal cannot be revoked.");
    if (!record.file.insideRoot)
      throw new Error(
        "A permission outside the protected root cannot be changed by this workflow.",
      );
    if (
      record.file.mimeType !== "application/pdf" ||
      !record.file.reviewerTitles.length
    )
      throw new Error(
        "Ancestor-folder permissions are report-only so Modules and Syllabus access is not changed.",
      );
    pendingRevocations.push({
      fileId: fileId,
      permissionId: permissionId,
    });
  });
  if (isDryRun) {
    LoggerService.log("WARN", mrhLoggerCategoryForFunction_("applyReviewedReviewerPdfPermissionRevocations"), "reviewer_pdf_acl_revocation", {
        event: "reviewer_pdf_acl_revocation",
        action: "DRY_RUN",
        plannedCount: pendingRevocations.length,
      }, "applyReviewedReviewerPdfPermissionRevocations");
    return {
      dryRun: true,
      planned: pendingRevocations,
      revoked: [],
      audit: report,
    };
  }
  var revoked = [];
  pendingRevocations.forEach(function (reviewed) {
    var record =
      permissionsByKey[reviewed.fileId + ":" + reviewed.permissionId];
    try {
      Drive.Permissions.delete(reviewed.fileId, reviewed.permissionId, {
        supportsAllDrives: true,
      });
    } catch (error) {
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("applyReviewedReviewerPdfPermissionRevocations"), "reviewer_pdf_acl_revocation", {
          event: "reviewer_pdf_acl_revocation",
          fileId: reviewed.fileId,
          permissionId: reviewed.permissionId,
          permissionType: record.permission.type,
          role: record.permission.role,
          action: "DELETE",
          result: "FAILED",
          errorName: String((error && error.name) || "Error"),
        }, "applyReviewedReviewerPdfPermissionRevocations");
      throw error;
    }
    LoggerService.log("INFO", mrhLoggerCategoryForFunction_("applyReviewedReviewerPdfPermissionRevocations"), "reviewer_pdf_acl_revocation", {
        event: "reviewer_pdf_acl_revocation",
        fileId: reviewed.fileId,
        permissionId: reviewed.permissionId,
        permissionType: record.permission.type,
        role: record.permission.role,
        action: "DELETE",
        result: "SUCCESS",
      }, "applyReviewedReviewerPdfPermissionRevocations");
    revoked.push(reviewed);
  });
  return {
    dryRun: false,
    revoked: revoked,
    audit: auditReviewerPdfDrivePermissions(),
  };
}

function handleLogModuleAccessRequest(data) {
  var authorization = authorizeReviewerRequest_(data);
  if (authorization.error) return authorization.error;
  appendMRHAccessLog_(
    MRH_MODULE_LOG_SHEET_NAME,
    authorization.account,
    data.eventId,
    "ACCESS",
  );
  return jsonResponse({ status: "success" });
}

function handleLogResourceFileClickRequest(data) {
  var area = String((data && data.resourceArea) || "")
    .trim()
    .toUpperCase();
  var logSheetByArea = {
    SYLLABUS: "SYLLABUS",
    MODULES: MRH_MODULE_LOG_SHEET_NAME,
    REVIEWERS: "REVIEWERS",
  };
  if (!logSheetByArea[area])
    return errorResponse("Invalid resource category.", "BAD_REQUEST");

  var fileId = String((data && data.fileId) || "").trim();
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId))
    return errorResponse(
      "A valid resource file ID is required.",
      "BAD_REQUEST",
    );
  var fileName = cleanText(data && data.fileName, 200)
    .replace(/[\r\n\t|]/g, " ")
    .trim();
  if (!fileName)
    return errorResponse("A resource file name is required.", "BAD_REQUEST");
  var courseName = extractResourceCourseName_(fileName);

  var token = String((data && data.idToken) || "").trim();
  var sessionId = String((data && data.sessionId) || "").trim();
  var account = null;
  if (area === "REVIEWERS" || token || sessionId) {
    var authorization = authorizeReviewerRequest_(data);
    if (authorization.error) return authorization.error;
    account = authorization.account;
  }

  var courseCode = cleanText(data && data.course, 160);
  if (!courseCode && area === "MODULES")
    courseCode = cleanText(extractResourceCourseName_(fileName), 160);
  var eventDetails = {
    event: "FILE_CLICK",
    course: courseCode,
    year: cleanText(data && data.year, 40),
    semester: cleanText(data && data.semester, 40),
    category: cleanText(data && data.category, 40) || area,
    resource: courseName,
  };
  appendMRHAccessLog_(
    logSheetByArea[area],
    account,
    data.eventId,
    eventDetails,
  );
  return jsonResponse({ status: "success" });
}

function handleLogResourceDashboardActionRequest(data) {
  var area = String((data && data.resourceArea) || "")
    .trim()
    .toUpperCase();
  var logSheetByArea = {
    LIBRARY: "LIBRARY",
    SYLLABUS: "SYLLABUS",
    MODULES: MRH_MODULE_LOG_SHEET_NAME,
    SUBJECTS: MRH_MODULE_LOG_SHEET_NAME,
    REVIEWERS: "REVIEWERS",
    PROFILE: "REVIEWERS",
  };
  if (!logSheetByArea[area])
    return errorResponse("Invalid resource category.", "BAD_REQUEST");
  var action = String((data && data.action) || "")
    .trim()
    .toUpperCase();
  if (
    [
      "TAB_OPEN",
      "FILTER_YEAR",
      "FILTER_SEMESTER",
      "FILTER_CATEGORY",
      "SUBJECTS_SEARCH",
      "FOLDER_OPEN",
      "FOLDER_PAGE",
      "FOLDER_VIEW",
      "PDF_DOWNLOAD",
    ].indexOf(action) < 0
  )
    return errorResponse("Invalid resource action.", "BAD_REQUEST");
  var detail = cleanText(data && data.detail, 32)
    .replace(/[\r\n\t|:]/g, " ")
    .trim();
  if (action === "PDF_DOWNLOAD" && !detail) detail = "PDF download";
  if (action !== "TAB_OPEN" && !detail)
    return errorResponse("A filter value is required.", "BAD_REQUEST");
  var downloadFileId = String((data && data.fileId) || "").trim();
  var downloadIssuanceReference = String(
    (data && data.issuanceReference) || "",
  ).trim();
  if (action === "PDF_DOWNLOAD" && area !== "REVIEWERS")
    return errorResponse(
      "Protected PDF downloads must be logged under Reviewers.",
      "BAD_REQUEST",
    );
  var hasValidDownloadReference =
    action === "PDF_DOWNLOAD" &&
    /^[A-Za-z0-9_-]{10,200}$/.test(downloadFileId) &&
    /^MRH-[0-9]{4}-[0-9]{4}$/.test(downloadIssuanceReference);

  var token = String((data && data.idToken) || "").trim();
  var sessionId = String((data && data.sessionId) || "").trim();
  var account = null;
  if (area === "REVIEWERS") {
    if (token || sessionId) {
      var authorization = authorizeReviewerRequest_(data);
      if (authorization.error) return authorization.error;
      account = authorization.account;
    } else if (action !== "TAB_OPEN") {
      return errorResponse(
        "Sign in before recording this Reviewer action.",
        "UNAUTHORIZED",
      );
    }
  } else if (area === "PROFILE" && sessionId) {
    var profileSession = verifyReviewerSession_(sessionId, data);
    if (profileSession.valid)
      account = findMRHAccount_(profileSession.email, true) || {
        email: profileSession.email,
      };
  } else if (token || sessionId) {
    var authorization = authorizeReviewerRequest_(data);
    if (authorization.error) return authorization.error;
    account = authorization.account;
  }
  var eventDetails = {
    event: action,
    course: cleanText(data && data.course, 160),
    year: action === "FILTER_YEAR" ? detail : cleanText(data && data.year, 40),
    semester:
      action === "FILTER_SEMESTER"
        ? detail
        : cleanText(data && data.semester, 40),
    category:
      action === "FILTER_CATEGORY"
        ? detail
        : cleanText(data && data.category, 40) || area,
    resource:
      action === "PDF_DOWNLOAD"
        ? cleanText(data && data.resource, 200)
        : extractResourceCourseName_(data && data.resource),
    issuanceReference: hasValidDownloadReference
      ? downloadIssuanceReference
      : "",
    sourceFileId: hasValidDownloadReference ? downloadFileId : "",
  };
  appendMRHAccessLog_(
    logSheetByArea[area],
    account,
    data.eventId,
    eventDetails,
  );
  return jsonResponse({ status: "success" });
}

function handleBatchLogResourceEventsRequest(data) {
  var results = [];
  var failed = false;
  for (var i = 0; i < data.events.length; i++) {
    var event = data.events[i];
    var response =
      event.type === "log_resource_file_click"
        ? handleLogResourceFileClickRequest(event)
        : handleLogResourceDashboardActionRequest(event);
    var result;
    try {
      var responseContent =
        typeof response.getContent === "function"
          ? response.getContent()
          : response.text;
      result = JSON.parse(String(responseContent || ""));
    } catch (error) {
      result = {
        status: "error",
        code: "INVALID_LOG_RESPONSE",
        message: "A resource event could not be confirmed.",
      };
    }
    results.push({
      eventId: event.eventId,
      status: result.status === "success" ? "success" : "error",
      code: result.status === "success" ? "" : String(result.code || ""),
    });
    if (result.status !== "success") {
      failed = true;
      if (result.code === "TEMPORARY_UNAVAILABLE") break;
    }
  }
  if (failed)
    return jsonResponse({
      status: "error",
      code: "BATCH_PARTIAL_FAILURE",
      message: "One or more resource events could not be recorded.",
      results: results,
    });
  return jsonResponse({
    status: "success",
    processed: results.length,
    results: results,
  });
}

function isPrivateResourceFolderName(name) {
  return RESOURCE_PORTAL_PRIVATE_FOLDER_PATTERN.test(String(name || ""));
}

// Request-local memo only: it avoids repeatedly walking the same Drive ancestry
// (for example, when several shortcuts point into one folder) without retaining
// folder visibility decisions across separate requests where permissions or names
// may have changed.
var RESOURCE_FOLDER_BREADCRUMB_MEMO_ = Object.create(null);

function getResourceFolderBreadcrumbs(folder) {
  if (!folder) return null;
  var startingId;
  try {
    startingId = String(folder.getId() || "");
  } catch (error) {
    return null;
  }
  if (!startingId) return null;
  if (Object.prototype.hasOwnProperty.call(
    RESOURCE_FOLDER_BREADCRUMB_MEMO_,
    startingId,
  )) {
    var memoized = RESOURCE_FOLDER_BREADCRUMB_MEMO_[startingId];
    return Array.isArray(memoized)
      ? memoized.map(function (item) {
          return { id: item.id, name: item.name };
        })
      : null;
  }

  // Read the configured root once per ancestry walk rather than once for each
  // folder level (which would repeatedly call PropertiesService).
  var rootFolderId = getResourcePortalRootFolderId_();
  var breadcrumbs = [];
  var visited = Object.create(null);
  var current = folder;
  for (var depth = 0; depth < 15; depth++) {
    var currentId = String(current.getId() || "");
    if (!currentId || visited[currentId]) {
      RESOURCE_FOLDER_BREADCRUMB_MEMO_[startingId] = null;
      return null;
    }
    visited[currentId] = true;

    var currentName = String(current.getName() || "");
    if (isPrivateResourceFolderName(currentName)) {
      RESOURCE_FOLDER_BREADCRUMB_MEMO_[startingId] = null;
      return null;
    }
    breadcrumbs.unshift({ id: currentId, name: currentName });

    if (currentId === rootFolderId) {
      // Cache a separate breadcrumb prefix for each traversed folder, making
      // subsequent checks of siblings/ancestors cheap during this same request.
      for (var i = 0; i < breadcrumbs.length; i++) {
        RESOURCE_FOLDER_BREADCRUMB_MEMO_[breadcrumbs[i].id] = breadcrumbs
          .slice(0, i + 1)
          .map(function (item) {
            return { id: item.id, name: item.name };
          });
      }
      return breadcrumbs.map(function (item) {
        return { id: item.id, name: item.name };
      });
    }

    var parents = current.getParents();
    if (!parents.hasNext()) {
      RESOURCE_FOLDER_BREADCRUMB_MEMO_[startingId] = null;
      return null;
    }
    current = parents.next();
  }

  RESOURCE_FOLDER_BREADCRUMB_MEMO_[startingId] = null;
  return null;
}

function getResourceListingCacheKey(folderId, pageToken) {
  var cacheContext = JSON.stringify({
    version: 4,
    rootFolderId: getResourcePortalRootFolderId_(),
    folderId: String(folderId || ""),
    pageToken: String(pageToken || ""),
    privateFolderPattern: RESOURCE_PORTAL_PRIVATE_FOLDER_PATTERN.source,
    shortcutPolicy: "public-tree-targets-only",
  });
  return "mrh_resource_listing_v4_" + sha256Hex(cacheContext);
}

function isValidCachedResourceListing_(listing, folderId, pageToken) {
  if (
    !listing ||
    listing.status !== "success" ||
    !listing.folder ||
    listing.folder.id !== folderId ||
    typeof listing.folder.name !== "string" ||
    !Array.isArray(listing.items) ||
    typeof listing.truncated !== "boolean" ||
    String(listing.pageToken || "") !== pageToken ||
    typeof listing.nextPageToken !== "string" ||
    listing.nextPageToken.length > 2048 ||
    /[\u0000-\u001f\u007f]/.test(listing.nextPageToken) ||
    listing.truncated !== Boolean(listing.nextPageToken)
  ) {
    return false;
  }
  for (var index = 0; index < listing.items.length; index++) {
    var item = listing.items[index];
    if (
      !item ||
      !/^[A-Za-z0-9_-]{10,200}$/.test(String(item.id || "")) ||
      typeof item.name !== "string" ||
      !item.name ||
      (item.type !== "folder" && item.type !== "file") ||
      typeof item.mimeType !== "string" ||
      !item.mimeType ||
      (item.type === "folder") !==
        (item.mimeType === "application/vnd.google-apps.folder") ||
      (item.modifiedTime !== undefined &&
        typeof item.modifiedTime !== "string") ||
      (item.thumbnailLink !== undefined &&
        typeof item.thumbnailLink !== "string")
    ) {
      return false;
    }
  }
  return true;
}

function handleListPublicResourcesRequest(data) {
  var requestedFolderId = cleanText(data.folderId, 200);
  var folderId = requestedFolderId || getResourcePortalRootFolderId_();
  var pageToken = String(data.pageToken || "");
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(folderId))
    return errorResponse("Invalid folder ID.", "BAD_REQUEST");
  if (pageToken.length > 2048 || /[\u0000-\u001f\u007f]/.test(pageToken))
    return errorResponse("Invalid folder page token.", "BAD_REQUEST");
  var cacheKey = getResourceListingCacheKey(folderId, pageToken);
  var cache;
  var cachedListing = null;
  try {
    cache = CacheService.getScriptCache();
    var cachedValue = cache.get(cacheKey);
    if (cachedValue) {
      var parsedListing = JSON.parse(cachedValue);
      if (isValidCachedResourceListing_(parsedListing, folderId, pageToken)) {
        cachedListing = parsedListing;
      } else {
        cache.remove(cacheKey);
        LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("handleListPublicResourcesRequest"), "[handleListPublicResourcesRequest] Removed malformed listing cache entry.", { source: "migrated_structured_log", sourceLine: 6063 }, "handleListPublicResourcesRequest");
      }
    }
  } catch (cacheError) {
    if (cache && typeof cache.remove === "function") {
      try {
        cache.remove(cacheKey);
      } catch (removeError) {
        LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("handleListPublicResourcesRequest"), "[handleListPublicResourcesRequest] Invalid listing cache removal failed: " +
            removeError, { source: "migrated_structured_log", sourceLine: 6073 }, "handleListPublicResourcesRequest");
      }
    }
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("handleListPublicResourcesRequest"), "[handleListPublicResourcesRequest] Listing cache read failed: " +
        cacheError, { source: "migrated_structured_log", sourceLine: 6079 }, "handleListPublicResourcesRequest");
  }

  var folder;
  try {
    folder = mrhLoggedDriveGetFolderById_(folderId);
  } catch (error) {
    return errorResponse("This folder is unavailable.", "NOT_FOUND");
  }

  var breadcrumbs = getResourceFolderBreadcrumbs(folder);
  if (!breadcrumbs)
    return errorResponse("This folder is not available.", "FORBIDDEN");

  if (cachedListing) {
    return jsonResponse({
      status: "success",
      folder: breadcrumbs[breadcrumbs.length - 1],
      breadcrumbs: breadcrumbs,
      items: cachedListing.items.map(function (item) {
        var safeItem = {
          id: item.id,
          name: item.name,
          type: item.type,
          mimeType: item.mimeType,
        };
        if (item.modifiedTime !== undefined)
          safeItem.modifiedTime = item.modifiedTime;
        if (item.thumbnailLink !== undefined)
          safeItem.thumbnailLink = item.thumbnailLink;
        return safeItem;
      }),
      pageToken: pageToken,
      nextPageToken: cachedListing.nextPageToken,
      truncated: cachedListing.truncated,
    });
  }

  var items = [];
  var driveResponse = Drive.Files.list({
    q: "'" + folderId + "' in parents and trashed = false",
    pageSize: RESOURCE_PORTAL_MAX_ITEMS,
    pageToken: pageToken || undefined,
    fields:
      "nextPageToken,files(id,name,mimeType,modifiedTime,thumbnailLink,shortcutDetails(targetId,targetMimeType))",
    corpora: "user",
  });
  if (!driveResponse || !Array.isArray(driveResponse.files))
    throw new Error("Drive returned an invalid resource listing.");

  for (var i = 0; i < driveResponse.files.length; i++) {
    var driveItem = driveResponse.files[i];
    var mimeType = String(driveItem.mimeType || "");
    var itemId = String(driveItem.id || "");
    if (mimeType === "application/vnd.google-apps.shortcut") {
      var shortcutDetails = driveItem.shortcutDetails || {};
      itemId = String(shortcutDetails.targetId || "");
      mimeType = String(shortcutDetails.targetMimeType || "");
      if (
        !/^[A-Za-z0-9_-]{10,200}$/.test(itemId) ||
        !mimeType ||
        mimeType === "application/vnd.google-apps.shortcut"
      ) {
        continue;
      }
      try {
        if (mimeType === "application/vnd.google-apps.folder") {
          if (!getResourceFolderBreadcrumbs(mrhLoggedDriveGetFolderById_(itemId)))
            continue;
        } else if (!getResourceFileBreadcrumbs(mrhLoggedDriveGetFileById_(itemId))) {
          continue;
        }
      } catch (shortcutError) {
        LoggerService.log("WARN", mrhLoggerCategoryForFunction_("handleListPublicResourcesRequest"), "[handleListPublicResourcesRequest] Skipping unresolvable shortcut.", { source: "migrated_structured_log", sourceLine: 6155 }, "handleListPublicResourcesRequest");
        continue;
      }
    }
    var isFolder = mimeType === "application/vnd.google-apps.folder";
    var itemName = String(driveItem.name || "");
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(itemId) || !mimeType)
      throw new Error("Drive returned an invalid resource item.");
    if (isFolder && isPrivateResourceFolderName(itemName)) continue;

    var item = {
      id: itemId,
      name: itemName,
      type: isFolder ? "folder" : "file",
      mimeType: mimeType,
    };
    if (!isFolder && driveItem.modifiedTime)
      item.modifiedTime = String(driveItem.modifiedTime);
    if (!isFolder && driveItem.thumbnailLink)
      item.thumbnailLink = String(driveItem.thumbnailLink);
    items.push(item);
  }

  items.sort(function (left, right) {
    if (left.type !== right.type) return left.type === "folder" ? -1 : 1;
    return TextUtils.naturalSortStrings(left.name, right.name);
  });

  var nextPageToken = String(driveResponse.nextPageToken || "");
  if (
    nextPageToken.length > 2048 ||
    /[\u0000-\u001f\u007f]/.test(nextPageToken) ||
    (pageToken && pageToken === nextPageToken)
  )
    throw new Error("Drive returned an invalid resource page token.");
  var listing = {
    status: "success",
    folder: breadcrumbs[breadcrumbs.length - 1],
    breadcrumbs: breadcrumbs,
    items: items,
    pageToken: pageToken,
    nextPageToken: nextPageToken,
    truncated: Boolean(nextPageToken),
  };
  var responseText = JSON.stringify(listing);
  if (responseText.length <= RESOURCE_PORTAL_MAX_CACHED_LISTING_CHARS) {
    try {
      if (!cache) cache = CacheService.getScriptCache();
      cache.put(
        cacheKey,
        responseText,
        RESOURCE_PORTAL_LISTING_CACHE_TTL_SECONDS,
      );
    } catch (cacheError) {
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("handleListPublicResourcesRequest"), "[handleListPublicResourcesRequest] Listing cache write failed: " +
          cacheError, { source: "migrated_structured_log", sourceLine: 6211 }, "handleListPublicResourcesRequest");
    }
  }
  return ContentService.createTextOutput(responseText).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function getResourceFileBreadcrumbs(file) {
  var parents = file.getParents();
  if (!parents.hasNext()) return null;

  var breadcrumbs = null;
  while (parents.hasNext()) {
    var parentBreadcrumbs = getResourceFolderBreadcrumbs(parents.next());
    if (!parentBreadcrumbs) return null;
    if (!breadcrumbs) breadcrumbs = parentBreadcrumbs;
  }
  return breadcrumbs;
}

function isIndexedReviewerPdfResource_(fileId) {
  var entries;
  try {
    entries = getReviewerPdfIndexEntries_();
    if (!Array.isArray(entries) || !entries.every(function (entry) {
      return Boolean(
        entry &&
        typeof entry === "object" &&
        /^[A-Za-z0-9_-]{10,200}$/.test(String(entry.fileId || "")) &&
        typeof entry.title === "string"
      );
    })) {
      throw new Error("Reviewer PDF protection index has an invalid structure.");
    }
  } catch (error) {
    // An unavailable or malformed index is not evidence that a file is public.
    // The caller must fail closed instead of continuing the public-preview path.
    LoggerService.log(
      "ERROR",
      "AUTH",
      "Reviewer PDF protection index could not be verified",
      { fileId: mrhLoggerSafeIdentifier_(fileId), errorName: String(error && error.name || "Error") },
      "isIndexedReviewerPdfResource_",
      error,
    );
    var protectionError = new Error("Reviewer PDF protection could not be verified.");
    protectionError.code = "RESOURCE_PROTECTION_CHECK_FAILED";
    throw protectionError;
  }
  for (var i = 0; i < entries.length; i++) {
    if (String(entries[i].fileId) === String(fileId || "")) return true;
  }
  return false;
}

function handleGetResourcePreviewRequest(data) {
  var fileId = cleanText(data.fileId, 200);
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId))
    return errorResponse("Invalid file ID.", "BAD_REQUEST");
  var previewMode = String(data.previewMode || "");
  if (previewMode && previewMode !== "drive")
    return errorResponse("Invalid preview mode.", "BAD_REQUEST");

  var file;
  try {
    file = mrhLoggedDriveGetFileById_(fileId);
  } catch (error) {
    return errorResponse("This file is unavailable.", "NOT_FOUND");
  }
  if (!getResourceFileBreadcrumbs(file))
    return errorResponse("This file is not available.", "FORBIDDEN");

  // Reviewer PDFs are protected independently of current folder names/location.
  // Fail closed if the authoritative protection index cannot be read.
  try {
    if (isIndexedReviewerPdfResource_(fileId))
      return errorResponse("This file is not available.", "FORBIDDEN");
  } catch (protectionError) {
    return errorResponse(
      "This resource is temporarily unavailable. Please try again later.",
      "TEMPORARY_UNAVAILABLE",
    );
  }

  var mimeType = file.getMimeType();
  if (previewMode === "drive")
    return jsonResponse({
      status: "success",
      deliveryMode: "drive",
      name: file.getName(),
      mimeType: mimeType,
    });

  var blob;
  var isGoogleWorkspaceFile =
    [
      "application/vnd.google-apps.document",
      "application/vnd.google-apps.spreadsheet",
      "application/vnd.google-apps.presentation",
    ].indexOf(mimeType) !== -1;
  if (
    !isGoogleWorkspaceFile &&
    file.getSize() > RESOURCE_PORTAL_MAX_PREVIEW_BYTES
  )
    return errorResponse(
      "This file exceeds the 32 MiB in-site preview transport limit.",
      "FILE_TOO_LARGE",
    );

  if (isGoogleWorkspaceFile) {
    blob = file.getAs("application/pdf");
    mimeType = "application/pdf";
  } else {
    blob = file.getBlob();
  }

  var bytes = blob.getBytes();
  if (bytes.length > RESOURCE_PORTAL_MAX_PREVIEW_BYTES)
    return errorResponse(
      "This file exceeds the 32 MiB in-site preview transport limit.",
      "FILE_TOO_LARGE",
    );

  var preview = {
    status: "success",
    name: file.getName(),
    mimeType: mimeType,
    data: Utilities.base64Encode(bytes),
  };
  return jsonResponse(preview);
}

function isSupportedClientVersion(value) {
  var match = String(value || "")
    .trim()
    .match(
      /^(?:mrh-)?(?:release-)?(\d+)\.(\d+)\.(\d+)(?:-(\d+))?(?:-[a-f0-9]{7,40})?$/i,
    );
  if (!match) return false;

  var clientParts = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4] || 0),
  ];
  var minimumParts = MINIMUM_SUPPORTED_CLIENT_VERSION.split(/[.-]/).map(Number);
  for (var i = 0; i < minimumParts.length; i++) {
    if (clientParts[i] > minimumParts[i]) return true;
    if (clientParts[i] < minimumParts[i]) return false;
  }
  return true;
}

function clientVersionRequired(version) {
  return isSupportedClientVersion(version)
    ? null
    : errorResponse(
        "This app version is no longer supported. Reload the current website to continue.",
        "CLIENT_UPDATE_REQUIRED",
      );
}

function cleanText(value, maxLength) {
  if (value === null || value === undefined) return "";
  return String(value).trim().substring(0, maxLength);
}

function extractResourceCourseName_(value) {
  var raw = String(value == null ? "" : value).trim();
  if (!raw) return "";
  var openParenthesis = raw.indexOf("(");
  if (openParenthesis < 0) return "";
  var resourceTitle = raw.slice(0, openParenthesis).trim();
  var separators = /[\s]+[-\u2012-\u2015][\s]+/g;
  var separator = separators.exec(resourceTitle);
  if (!separator) return "";
  return resourceTitle.slice(separator.index + separator[0].length).trim();
}

function sheetCellText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function safeCellText(value, maxLength) {
  return escapeFormulaInjection_(cleanText(value, maxLength));
}

function toBoolean(value, fallback) {
  if (value === null || value === undefined) return !!fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    var normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].indexOf(normalized) !== -1) return true;
    if (["false", "0", "no", "n", "off", ""].indexOf(normalized) !== -1)
      return false;
  }
  return !!fallback;
}

function normalizeSubjectFromPath(parts) {
  if (!Array.isArray(parts)) return "";
  return parts
    .map(function (part) {
      return String(part || "").trim();
    })
    .filter(function (part) {
      return Boolean(part);
    })
    .join("::");
}

function normalizeSubject(subject) {
  return normalizeSubjectFromPath(String(subject || "").split("::"));
}

function buildSpreadsheetSubject(
  pathPrefix,
  fileName,
  sheetName,
  isSingleSheet,
) {
  var prefix = normalizeSubject(pathPrefix);
  var file = String(fileName == null ? "" : fileName).trim();
  var sheet = String(sheetName == null ? "" : sheetName).trim();

  if (!file) return prefix;
  if (!prefix) return isSingleSheet || !sheet ? file : file + "::" + sheet;

  if (isSingleSheet) {
    var parts = prefix.split("::");
    var parentFolderName = String(parts[parts.length - 1] || "").trim();
    if (
      parentFolderName &&
      parentFolderName.toLowerCase() === file.toLowerCase()
    ) {
      return prefix;
    }
    return prefix + "::" + file;
  }

  if (!sheet) return prefix + "::" + file;
  return prefix + "::" + file + "::" + sheet;
}

function compareSubjectHierarchy(left, right) {
  var leftParts = String(left || "")
    .split("::")
    .filter(Boolean);
  var rightParts = String(right || "")
    .split("::")
    .filter(Boolean);
  if (leftParts.length !== rightParts.length)
    return leftParts.length - rightParts.length;
  return TextUtils.naturalSortStrings(left, right);
}

function invalidateMetadataCache() {
  deckMetadataCache = null;
  deckMetadataCacheTime = 0;
  invalidatePersistentMetadataCache_();
}

function invalidatePersistentMetadataCache_() {
  var previousMetadataVersion = "";
  try {
    var properties = getScriptProps();
    previousMetadataVersion =
      properties.getProperty("MRH_DECK_METADATA_VERSION") || "0";
    var nextMetadataVersion = Number(previousMetadataVersion) + 1;
    properties.setProperty(
      "MRH_DECK_METADATA_VERSION",
      String(
        Number.isFinite(nextMetadataVersion) ? nextMetadataVersion : Date.now(),
      ),
    );
  } catch (propertyError) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("invalidatePersistentMetadataCache_"), "[invalidateMetadataCache] Metadata cache generation update failed.", { source: "migrated_structured_log", sourceLine: 6487 }, "invalidatePersistentMetadataCache_");
  }
  try {
    var cache = CacheService.getScriptCache();
    cache.remove("mrh_deck_metadata_v1");
    var cacheVersion = getCacheInvalidationVersion();
    if (cacheVersion)
      cache.remove(
        getDeckSyncSummaryCacheKey_(cacheVersion, previousMetadataVersion),
      );
  } catch (cacheError) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("invalidatePersistentMetadataCache_"), "[invalidateMetadataCache] Persistent metadata or sync summary cache invalidation failed.", { source: "migrated_structured_log", sourceLine: 6500 }, "invalidatePersistentMetadataCache_");
  }
}

function getScriptProps() {
  return PropertiesService.getScriptProperties();
}

function sha256Hex(value) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ""),
    Utilities.Charset.UTF_8,
  );
  return bytes
    .map(function (b) {
      var v = b < 0 ? b + 256 : b;
      return (v < 16 ? "0" : "") + v.toString(16);
    })
    .join("");
}

const PASSWORD_PBKDF2_ITERATIONS = 600000;
const PASSWORD_PBKDF2_MIN_VERIFY_ITERATIONS = 100000;
const PASSWORD_PBKDF2_MAX_VERIFY_ITERATIONS = 600000;
const PASSWORD_VERIFICATION_CACHE_TTL_SECONDS = 300;
const PASSWORD_HASH_MIGRATION_VERSION = "3";
const PASSWORD_HASH_MIGRATION_PROPERTY = "MRH_PASSWORD_HASH_MIGRATION_VERSION";
const PASSWORD_HASH_MIGRATION_NEXT_ROW_PROPERTY = "MRH_PASSWORD_HASH_MIGRATION_NEXT_ROW";
const PASSWORD_HASH_MIGRATION_STATE_PROPERTY = "MRH_PASSWORD_HASH_MIGRATION_STATE";
const PASSWORD_HASH_MIGRATION_BATCH_SCAN_ROWS = 500;
const PASSWORD_HASH_MIGRATION_MAX_HASHES_PER_RUN = 3;
const PASSWORD_HASH_MIGRATION_TRIGGER_HANDLER = "resumeDeckPasswordHashMigration";
const PASSWORD_HASH_BACKUP_PENDING_PROPERTY = "MRH_PASSWORD_HASH_BACKUP_SYNC_PENDING";
var MRH_PASSWORD_HASH_MIGRATION_CHECKED_ = false;
var MRH_PASSWORD_BACKUP_RETRY_CHECKED_ = false;

function byteArrayToHex_(bytes) {
  return (bytes || []).map(function (byte) {
    var value = Number(byte) & 255;
    return (value < 16 ? "0" : "") + value.toString(16);
  }).join("");
}

// PBKDF2-HMAC-SHA-256, block index 1, RFC 8018. Only the 32-byte derived key
// is needed for password verification; the salt is generated independently per record.
function pbkdf2HmacSha256Hex_(password, salt, iterations) {
  var normalized = String(password == null ? "" : password);
  var effectiveSalt = String(salt || "");
  var rounds = Number(iterations);
  if (!Number.isInteger(rounds) || rounds < PASSWORD_PBKDF2_MIN_VERIFY_ITERATIONS || rounds > PASSWORD_PBKDF2_MAX_VERIFY_ITERATIONS)
    throw new Error("Unsupported PBKDF2 iteration count.");

  var saltBytes = Utilities.newBlob(effectiveSalt).getBytes();
  var blockInput = saltBytes.concat([0, 0, 0, 1]);
  var u = Utilities.computeHmacSha256Signature(blockInput, normalized);
  var derived = u.map(function (byte) { return Number(byte) & 255; });
  for (var iteration = 1; iteration < rounds; iteration++) {
    u = Utilities.computeHmacSha256Signature(u, normalized);
    for (var index = 0; index < derived.length; index++)
      derived[index] = (derived[index] ^ (Number(u[index]) & 255)) & 255;
  }
  return byteArrayToHex_(derived);
}

function hashPasswordWithSalt(password, salt, iterations) {
  var normalized = String(password == null ? "" : password);
  if (!normalized) return "";
  var effectiveSalt = String(salt || Utilities.getUuid().replace(/-/g, ""));
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(effectiveSalt))
    throw new Error("Invalid password hash salt.");
  var rounds = iterations === undefined || iterations === null || iterations === ""
    ? PASSWORD_PBKDF2_ITERATIONS
    : Number(iterations);
  if (!Number.isInteger(rounds) || rounds < PASSWORD_PBKDF2_MIN_VERIFY_ITERATIONS || rounds > PASSWORD_PBKDF2_MAX_VERIFY_ITERATIONS)
    throw new Error("Unsupported PBKDF2 iteration count.");
  return "pbkdf2-sha256$" + rounds + "$" + effectiveSalt + "$" + pbkdf2HmacSha256Hex_(normalized, effectiveSalt, rounds);
}

// Legacy verification is retained for existing supported hashes only. Successful
// verification upgrades these records to the current PBKDF2 iteration target.
function hashLegacyPasswordWithSalt_(password, salt, iterations) {
  var normalized = String(password == null ? "" : password);
  var effectiveSalt = String(salt || "");
  var rounds = Number(iterations);
  if (!Number.isInteger(rounds) || rounds < 500 || rounds > 50000) return "";
  var hash = sha256Hex(effectiveSalt + ":" + normalized);
  for (var i = 1; i < rounds; i++) hash = sha256Hex(effectiveSalt + ":" + hash);
  return "sha256i$" + rounds + "$" + effectiveSalt + "$" + hash;
}

function isPbkdf2PasswordHash(value) {
  var match = /^pbkdf2-sha256\$(\d+)\$([A-Za-z0-9_-]{16,64})\$([a-f0-9]{64})$/i.exec(String(value || ""));
  if (!match) return false;
  var iterations = Number(match[1]);
  return Number.isInteger(iterations) &&
    iterations >= PASSWORD_PBKDF2_MIN_VERIFY_ITERATIONS &&
    iterations <= PASSWORD_PBKDF2_MAX_VERIFY_ITERATIONS;
}

function isLegacyPasswordHash(value) {
  return /^sha256\$[^\$]+\$[a-f0-9]{64}$/i.test(String(value || ""));
}

function isIteratedPasswordHash(value) {
  return /^sha256i\$\d+\$[^\$]+\$[a-f0-9]{64}$/i.test(String(value || ""));
}

function isLegacyPasswordHashFormat_(value) {
  return isLegacyPasswordHash(value) || isIteratedPasswordHash(value);
}

function parseWrappedLegacyPasswordHash_(value) {
  var stored = String(value || "");
  var match = /^pbkdf2-wrap-sha256\$(\d+)\$([A-Za-z0-9_-]{16,64})\$([a-f0-9]{64})\$(.+)$/i.exec(stored);
  var format = "sha256";
  var legacyIterations = 0;
  if (!match) {
    match = /^pbkdf2-wrap-sha256i\$(\d+)\$([A-Za-z0-9_-]{16,64})\$([a-f0-9]{64})\$(\d+)\$(.+)$/i.exec(stored);
    format = "sha256i";
  }
  if (!match) return null;

  var iterations = Number(match[1]);
  if (!Number.isInteger(iterations) ||
      iterations < PASSWORD_PBKDF2_MIN_VERIFY_ITERATIONS ||
      iterations > PASSWORD_PBKDF2_MAX_VERIFY_ITERATIONS) return null;
  if (format === "sha256i") {
    legacyIterations = Number(match[4]);
    if (!Number.isInteger(legacyIterations) || legacyIterations < 500 || legacyIterations > 50000) return null;
  }
  var legacySalt;
  try { legacySalt = decodeURIComponent(match[format === "sha256i" ? 5 : 4]); }
  catch (error) { return null; }
  if (!legacySalt || legacySalt.indexOf("$") !== -1) return null;

  return {
    format: format,
    iterations: iterations,
    salt: match[2],
    digest: match[3].toLowerCase(),
    legacyIterations: legacyIterations,
    legacySalt: legacySalt,
  };
}

function isWrappedLegacyPasswordHash_(value) {
  return Boolean(parseWrappedLegacyPasswordHash_(value));
}

function wrapLegacyPasswordHash_(legacyHash, iterations) {
  var stored = normalizeStoredPassword(legacyHash);
  var format;
  var legacySalt;
  var legacyIterations = 0;
  if (isLegacyPasswordHash(stored)) {
    var plainParts = stored.split("$");
    format = "sha256";
    legacySalt = plainParts[1];
  } else if (isIteratedPasswordHash(stored)) {
    var iteratedParts = stored.split("$");
    format = "sha256i";
    legacyIterations = Number(iteratedParts[1]);
    legacySalt = iteratedParts[2];
    if (!Number.isInteger(legacyIterations) || legacyIterations < 500 || legacyIterations > 50000)
      throw new Error("An unsupported legacy iterative password hash must be reset before migration.");
  } else {
    throw new Error("Only recognized legacy password hashes can be wrapped.");
  }
  if (!legacySalt || legacySalt.indexOf("$") !== -1)
    throw new Error("A legacy password hash contains an invalid salt.");

  // PBKDF2 wraps the complete legacy encoded hash. The legacy salt/work factor
  // remain as metadata so a successful login can be verified without storing the
  // old digest separately; then successful authentication upgrades it to a direct
  // PBKDF2 hash of the submitted password.
  var wrapped = hashPasswordWithSalt(stored, "", iterations);
  var parts = wrapped.split("$");
  var prefix = format === "sha256i" ? "pbkdf2-wrap-sha256i" : "pbkdf2-wrap-sha256";
  var result = [prefix, parts[1], parts[2], parts[3]];
  if (format === "sha256i") result.push(String(legacyIterations));
  result.push(encodeURIComponent(legacySalt));
  return result.join("$");
}

function looksLikeUnsupportedPasswordHash_(value) {
  return /^(?:\$2[aby]\$|argon2(?:id|i|d)?\$|bcrypt\$|pbkdf2(?:[-_][a-z0-9]+)?\$|scrypt\$|sha(?:1|224|384|512)\$|md5\$)/i.test(String(value || ""));
}

function normalizeStoredPassword(value) {
  return String(value == null ? "" : value).trim();
}

function normalizePasswordForStorage_(value) {
  var password = normalizeStoredPassword(value);
  if (!password) return "";
  if (isPbkdf2PasswordHash(password) || isWrappedLegacyPasswordHash_(password) || isLegacyPasswordHashFormat_(password)) return password;
  // Plaintext is only accepted as input to storage normalization and immediately
  // hashed. It is never accepted as proof of a password during authentication.
  return hashPasswordWithSalt(password);
}

function ensureDeckPasswordHashMigration_() {
  if (MRH_PASSWORD_HASH_MIGRATION_CHECKED_) return true;
  var properties = getScriptProps();
  if (String(properties.getProperty(PASSWORD_HASH_MIGRATION_PROPERTY) || "") !== PASSWORD_HASH_MIGRATION_VERSION) {
    var error = new Error(
      "Deck-password migration is incomplete. Run migrateDeckPasswordsToPbkdf2() from the Apps Script editor and wait for status=complete before deploying the new web-app version."
    );
    error.code = "PASSWORD_MIGRATION_REQUIRED";
    throw error;
  }

  MRH_PASSWORD_HASH_MIGRATION_CHECKED_ = true;
  // If the UUID source sheet was secured but its private backup write failed, retry
  // once per execution. The migration trigger also retries this condition.
  if (
    !MRH_PASSWORD_BACKUP_RETRY_CHECKED_ &&
    properties.getProperty(PASSWORD_HASH_BACKUP_PENDING_PROPERTY) === "true"
  ) {
    MRH_PASSWORD_BACKUP_RETRY_CHECKED_ = true;
    if (writeUUIDMetadataBackup_()) {
      properties.deleteProperty(PASSWORD_HASH_BACKUP_PENDING_PROPERTY);
      LoggerService.log("INFO", "SPREADSHEET_OPS", "Private UUID metadata backup synchronization recovered", {}, "ensureDeckPasswordHashMigration_");
    } else {
      LoggerService.log("ERROR", "SPREADSHEET_OPS", "Private UUID metadata backup is still stale after password migration", {}, "ensureDeckPasswordHashMigration_");
    }
  }
  return true;
}

function migrateDeckPasswordsToPbkdf2() {
  // OPERATIONAL SAFETY: this job rewrites UUID column D in bounded batches.
  // Older deployed web-app versions do not understand PBKDF2 hashes and can
  // reject rows as they are converted. Put the old web app into maintenance / make
  // it temporarily unavailable before starting; keep it unavailable until this
  // job returns status="complete", MRH_PASSWORD_HASH_BACKUP_SYNC_PENDING is clear,
  // and the new code is deployed. Do not run this migration against live traffic.
  // Run from the Apps Script editor. A one-minute trigger resumes bounded batches.
  return runDeckPasswordHashMigrationBatch_();
}

function resumeDeckPasswordHashMigration() {
  try {
    return runDeckPasswordHashMigrationBatch_();
  } catch (error) {
    LoggerService.log("ERROR", "TRIGGER", "Resumable deck-password migration batch failed", { errorCode: String((error && error.code) || "MIGRATION_FAILED") }, "resumeDeckPasswordHashMigration", error);
    throw error;
  }
}

function runDeckPasswordHashMigrationBatch_() {
  try {
    ensureDeckPasswordHashMigrationTrigger_();
  } catch (triggerError) {
    LoggerService.log("WARN", "TRIGGER", "Password-migration continuation trigger could not be installed before the batch; manual reruns may be required", {}, "runDeckPasswordHashMigrationBatch_", triggerError);
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(BUILDER_LOCK_TIMEOUT_MS)) {
    LoggerService.log("WARN", "TRIGGER", "Deck-password migration batch deferred because the script lock is busy", {}, "runDeckPasswordHashMigrationBatch_");
    return { status: "busy", continuationScheduled: true };
  }

  var result = null;
  try {
    var properties = getScriptProps();
    if (String(properties.getProperty(PASSWORD_HASH_MIGRATION_PROPERTY) || "") === PASSWORD_HASH_MIGRATION_VERSION) {
      MRH_PASSWORD_HASH_MIGRATION_CHECKED_ = true;
      MRH_PASSWORD_BACKUP_RETRY_CHECKED_ = true;
      var backupPending = properties.getProperty(PASSWORD_HASH_BACKUP_PENDING_PROPERTY) === "true";
      if (backupPending && writeUUIDMetadataBackup_(null, true)) {
        properties.deleteProperty(PASSWORD_HASH_BACKUP_PENDING_PROPERTY);
        properties.setProperty(PASSWORD_HASH_MIGRATION_STATE_PROPERTY, "COMPLETE");
        backupPending = false;
      }
      if (!backupPending) properties.setProperty(PASSWORD_HASH_MIGRATION_STATE_PROPERTY, "COMPLETE");
      result = { status: backupPending ? "backup_pending" : "complete", migratedRecords: 0, continuationScheduled: backupPending };
    } else {
    properties.setProperty(PASSWORD_HASH_MIGRATION_STATE_PROPERTY, "RUNNING");
    var sheet = getOrInitializeUUIDSheet();
    var lastRow = sheet.getLastRow();
    var nextRow = Number(properties.getProperty(PASSWORD_HASH_MIGRATION_NEXT_ROW_PROPERTY) || 2);
    if (!Number.isInteger(nextRow) || nextRow < 2) nextRow = 2;
    var migrated = 0;
    var scannedStart = nextRow;

    if (lastRow >= 2 && nextRow <= lastRow) {
      var scanEnd = Math.min(lastRow, nextRow + PASSWORD_HASH_MIGRATION_BATCH_SCAN_ROWS - 1);
      var cells = sheet.getRange(nextRow, 4, scanEnd - nextRow + 1, 1).getValues();
      var cursor = nextRow;
      var stopForBatchLimit = false;
      var stopForConcurrentChange = false;

      for (var i = 0; i < cells.length; i++) {
        var rowNumber = nextRow + i;
        cursor = rowNumber;
        var rawValue = cells[i][0];
        var normalized = normalizeStoredPassword(rawValue);
        var needsHash = Boolean(normalized) &&
          !isPbkdf2PasswordHash(normalized) &&
          !isWrappedLegacyPasswordHash_(normalized);

        if (needsHash && migrated >= PASSWORD_HASH_MIGRATION_MAX_HASHES_PER_RUN) {
          stopForBatchLimit = true;
          break;
        }
        if (needsHash) {
          var currentValue = sheet.getRange(rowNumber, 4).getValue();
          if (String(currentValue == null ? "" : currentValue) !== String(rawValue == null ? "" : rawValue)) {
            stopForConcurrentChange = true;
            break;
          }
          if (looksLikeUnsupportedPasswordHash_(normalized) && !isLegacyPasswordHashFormat_(normalized)) {
            var unsupportedHashError = new Error(
              "Unsupported password-hash format at UUID sheet row " + rowNumber + ". Reset that deck password before rerunning the migration."
            );
            unsupportedHashError.code = "UNSUPPORTED_PASSWORD_HASH_FORMAT";
            throw unsupportedHashError;
          }
          var migratedPasswordHash = isLegacyPasswordHashFormat_(normalized)
            ? wrapLegacyPasswordHash_(normalized)
            : hashPasswordWithSalt(normalized);
          sheet.getRange(rowNumber, 4).setValue(migratedPasswordHash);
          migrated++;
          LoggerService.recordOperation_("spreadsheet.uuid.passwordHashMigrated", 1);
        }
        cursor = rowNumber + 1;
      }

      if (stopForConcurrentChange) {
        nextRow = cursor;
      } else if (stopForBatchLimit) {
        nextRow = cursor;
      } else {
        nextRow = scanEnd + 1;
      }
    } else {
      nextRow = lastRow + 1;
    }

    properties.setProperty(PASSWORD_HASH_MIGRATION_NEXT_ROW_PROPERTY, String(nextRow));
    var allRowsScanned = nextRow > lastRow;
    if (allRowsScanned) {
      // Final full-column verification catches values inserted or edited while the
      // resumable job was running. No plaintext/unrecognized nonempty value may remain.
      var finalCells = lastRow >= 2 ? sheet.getRange(2, 4, lastRow - 1, 1).getValues() : [];
      var firstUnmigratedRow = 0;
      for (var check = 0; check < finalCells.length; check++) {
        var finalValue = normalizeStoredPassword(finalCells[check][0]);
        if (finalValue && !isPbkdf2PasswordHash(finalValue) && !isWrappedLegacyPasswordHash_(finalValue)) {
          firstUnmigratedRow = check + 2;
          break;
        }
      }
      if (firstUnmigratedRow) {
        nextRow = firstUnmigratedRow;
        properties.setProperty(PASSWORD_HASH_MIGRATION_NEXT_ROW_PROPERTY, String(nextRow));
        properties.setProperty(PASSWORD_HASH_MIGRATION_STATE_PROPERTY, "RUNNING");
        result = {
          status: "pending",
          migratedRecords: migrated,
          nextRow: nextRow,
          totalRows: Math.max(0, lastRow - 1),
          continuationScheduled: true,
        };
      } else {
        // Commit the completion marker only after the live sheet has been verified.
        properties.setProperty(PASSWORD_HASH_MIGRATION_PROPERTY, PASSWORD_HASH_MIGRATION_VERSION);
        properties.deleteProperty(PASSWORD_HASH_MIGRATION_NEXT_ROW_PROPERTY);
        properties.setProperty(PASSWORD_HASH_MIGRATION_STATE_PROPERTY, "BACKUP_SYNC");
        MRH_PASSWORD_HASH_MIGRATION_CHECKED_ = true;
        invalidateMetadataCache();
        var backupWritten = writeUUIDMetadataBackup_(null, true);
        if (backupWritten) {
          properties.deleteProperty(PASSWORD_HASH_BACKUP_PENDING_PROPERTY);
          properties.setProperty(PASSWORD_HASH_MIGRATION_STATE_PROPERTY, "COMPLETE");
        } else {
          properties.setProperty(PASSWORD_HASH_BACKUP_PENDING_PROPERTY, "true");
        }
        result = {
          status: backupWritten ? "complete" : "backup_pending",
          migratedRecords: migrated,
          totalRows: Math.max(0, lastRow - 1),
          continuationScheduled: !backupWritten,
        };
      }
    } else {
      result = {
        status: "pending",
        migratedRecords: migrated,
        nextRow: nextRow,
        totalRows: Math.max(0, lastRow - 1),
        continuationScheduled: true,
      };
    }
    LoggerService.log(
      result.status === "complete" ? "INFO" : "WARN",
      "AUTH",
      "Deck-password migration batch finished",
      { status: result.status, migratedRecords: migrated, scannedStartRow: scannedStart, nextRow: result.nextRow || null, totalRows: result.totalRows || 0 },
      "runDeckPasswordHashMigrationBatch_",
    );
    }
  } catch (error) {
    LoggerService.log("ERROR", "AUTH", "Deck-password migration batch failed", { errorCode: String((error && error.code) || "MIGRATION_FAILED") }, "runDeckPasswordHashMigrationBatch_", error);
    throw error;
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }

  if (result && result.continuationScheduled) {
    try {
      ensureDeckPasswordHashMigrationTrigger_();
      result.triggerInstalled = true;
    } catch (triggerError) {
      result.continuationScheduled = false;
      result.manualContinuationRequired = true;
      result.triggerInstalled = false;
      LoggerService.log("ERROR", "TRIGGER", "Password migration is pending but its continuation trigger could not be installed; run migrateDeckPasswordsToPbkdf2() again manually", { status: result.status, nextRow: result.nextRow || null }, "runDeckPasswordHashMigrationBatch_", triggerError);
    }
  } else {
    try {
      removeDeckPasswordHashMigrationTriggers_();
    } catch (triggerError) {
      LoggerService.log("WARN", "TRIGGER", "Password migration finished but an obsolete continuation trigger could not be removed", {}, "runDeckPasswordHashMigrationBatch_", triggerError);
    }
  }
  return result;
}

function ensureDeckPasswordHashMigrationTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === PASSWORD_HASH_MIGRATION_TRIGGER_HANDLER) return true;
  }
  ScriptApp.newTrigger(PASSWORD_HASH_MIGRATION_TRIGGER_HANDLER).timeBased().everyMinutes(1).create();
  return true;
}

function removeDeckPasswordHashMigrationTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  triggers.forEach(function (trigger) {
    if (trigger.getHandlerFunction() === PASSWORD_HASH_MIGRATION_TRIGGER_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  if (removed) LoggerService.log("INFO", "TRIGGER", "Completed password-migration continuation triggers removed", { removedTriggers: removed }, "removeDeckPasswordHashMigrationTriggers_");
  return removed;
}

function upgradeDeckPasswordHash_(subject, storedValue, providedPassword, metadataMap) {
  var oldHash = normalizeStoredPassword(storedValue);
  var normalized = normalizeSubject(subject);
  var parts = normalized.split("::");
  var current = "";
  var sourceRecord = null;
  for (var i = 0; i < parts.length; i++) {
    current = current ? current + "::" + parts[i] : parts[i];
    var record = metadataMap && metadataMap[current];
    if (record && normalizeStoredPassword(record.password) === oldHash) sourceRecord = record;
  }
  if (!sourceRecord || !sourceRecord.subject) return false;

  var lock = LockService.getScriptLock();
  var alreadyHeld = Boolean(lock && typeof lock.hasLock === "function" && lock.hasLock());
  var acquiredHere = false;
  if (!alreadyHeld) {
    acquiredHere = Boolean(lock && lock.tryLock(5000));
    if (!acquiredHere) return false;
  }
  try {
    var sheet = getOrInitializeUUIDSheet();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return false;
    var values = sheet.getRange(2, 2, lastRow - 1, 3).getValues();
    for (var row = 0; row < values.length; row++) {
      if (
        normalizeSubject(values[row][0]) === normalizeSubject(sourceRecord.subject) &&
        normalizeStoredPassword(values[row][2]) === oldHash
      ) {
        var newHash = hashPasswordWithSalt(providedPassword);
        sheet.getRange(row + 2, 4).setValue(newHash);
        sourceRecord.password = newHash;
        invalidateMetadataCache();
        LoggerService.log(
          "INFO",
          "AUTH",
          "Deck-password hash upgraded to the current PBKDF2 configuration",
          { subjectHash: sha256Hex(sourceRecord.subject) },
          "upgradeDeckPasswordHash_",
        );
        return true;
      }
    }
    return false;
  } catch (error) {
    LoggerService.log("WARN", "AUTH", "Deck-password hash upgrade failed; the verified stored hash remains usable", { subjectHash: sha256Hex(normalized) }, "upgradeDeckPasswordHash_", error);
    return false;
  } finally {
    if (acquiredHere && lock) {
      try { lock.releaseLock(); } catch (ignored) {}
    }
  }
}

function passwordMatches(providedPassword, storedValue) {
  var provided = String(providedPassword == null ? "" : providedPassword);
  var stored = normalizeStoredPassword(storedValue);
  // Empty means no password is configured; protected route handlers only call
  // this verifier when a non-empty effective password is required.
  if (!stored) return true;
  if (!provided) return false;

  if (isWrappedLegacyPasswordHash_(stored)) {
    var wrapped = parseWrappedLegacyPasswordHash_(stored);
    var legacyCandidate;
    if (wrapped.format === "sha256") {
      legacyCandidate = "sha256$" + wrapped.legacySalt + "$" + sha256Hex(wrapped.legacySalt + ":" + provided);
    } else {
      legacyCandidate = hashLegacyPasswordWithSalt_(provided, wrapped.legacySalt, wrapped.legacyIterations);
    }
    if (!legacyCandidate) return false;
    try {
      return constantTimeEqual(
        pbkdf2HmacSha256Hex_(legacyCandidate, wrapped.salt, wrapped.iterations),
        wrapped.digest,
      );
    } catch (wrappedError) {
      LoggerService.log("ERROR", "AUTH", "Wrapped legacy password verification failed", { errorName: String((wrappedError && wrappedError.name) || "Error") }, "passwordMatches", wrappedError);
      return false;
    }
  }

  if (isPbkdf2PasswordHash(stored)) {
    var parts = stored.split("$");
    var rounds = Number(parts[1]);
    if (!Number.isInteger(rounds) || rounds < PASSWORD_PBKDF2_MIN_VERIFY_ITERATIONS || rounds > PASSWORD_PBKDF2_MAX_VERIFY_ITERATIONS)
      return false;
    try {
      var calculated = "pbkdf2-sha256$" + rounds + "$" + parts[2] + "$" + pbkdf2HmacSha256Hex_(provided, parts[2], rounds);
      return constantTimeEqual(calculated, stored);
    } catch (error) {
      LoggerService.log("ERROR", "AUTH", "PBKDF2 password verification failed", { errorName: String((error && error.name) || "Error") }, "passwordMatches", error);
      return false;
    }
  }

  if (isIteratedPasswordHash(stored)) {
    var legacyParts = stored.split("$");
    var legacyRounds = Number(legacyParts[1]);
    if (!Number.isFinite(legacyRounds) || legacyRounds < 500 || legacyRounds > 50000) return false;
    return constantTimeEqual(hashLegacyPasswordWithSalt_(provided, legacyParts[2], legacyRounds), stored);
  }

  if (isLegacyPasswordHash(stored)) {
    var oldParts = stored.split("$");
    return constantTimeEqual("sha256$" + oldParts[1] + "$" + sha256Hex(oldParts[1] + ":" + provided), stored);
  }

  // Crucial: no plaintext password value is accepted as an authentication proof.
  return false;
}

function verifyDeckPassword_(providedPassword, storedPassword, subject, metadataMap) {
  var provided = String(providedPassword == null ? "" : providedPassword);
  var stored = normalizeStoredPassword(storedPassword);
  if (!stored) return true;
  if (!provided) return false;

  // Cache only successful verification. The cache key binds the digest to both
  // the normalized deck identity and its exact current stored hash, so changing
  // a password invalidates previous successes without storing plaintext.
  var verificationCacheKey = "mrh_deck_password_verified_v1_" + sha256Hex(
    normalizeSubject(subject) + "\u0000" + stored + "\u0000" + provided,
  );
  try {
    if (CacheService.getScriptCache().get(verificationCacheKey) === "1")
      return true;
  } catch (cacheReadError) {
    LoggerService.log("DEBUG", "AUTH", "Password-verification cache read was unavailable; verifying normally", {}, "verifyDeckPassword_", cacheReadError);
  }

  if (!passwordMatches(provided, stored)) return false;
  var needsUpgrade = isLegacyPasswordHashFormat_(stored) || isWrappedLegacyPasswordHash_(stored);
  if (isPbkdf2PasswordHash(stored)) {
    var parts = stored.split("$");
    needsUpgrade = Number(parts[1]) < PASSWORD_PBKDF2_ITERATIONS;
  }
  if (needsUpgrade) {
    try { upgradeDeckPasswordHash_(subject, stored, provided, metadataMap); }
    catch (error) {
      LoggerService.log("WARN", "AUTH", "Verified deck-password hash could not be upgraded automatically", { subjectHash: sha256Hex(normalizeSubject(subject)) }, "verifyDeckPassword_", error);
    }
  }
  try {
    CacheService.getScriptCache().put(
      verificationCacheKey,
      "1",
      PASSWORD_VERIFICATION_CACHE_TTL_SECONDS,
    );
  } catch (cacheWriteError) {
    // Cache failure must not reject a correctly verified password.
    LoggerService.log("DEBUG", "AUTH", "Password-verification cache write was unavailable", {}, "verifyDeckPassword_", cacheWriteError);
  }
  return true;
}

function constantTimeEqual(left, right) {
  left = String(left || "");
  right = String(right || "");
  var length = Math.max(left.length, right.length);
  var result = left.length ^ right.length;
  for (var i = 0; i < length; i++) {
    var a = i < left.length ? left.charCodeAt(i) : 0;
    var b = i < right.length ? right.charCodeAt(i) : 0;
    result |= a ^ b;
  }
  return result === 0;
}

/* -------------------------------------------------------------------------- */
/* Cache versioning / chunked CacheService                                    */
/* -------------------------------------------------------------------------- */

function getCacheInvalidationVersion() {
  var version =
    getScriptProps().getProperty("MRH_CACHE_VERSION") ||
    getScriptProps().getProperty("CACHE_VER") ||
    "0";
  return String(version);
}

function setCacheVersionProperties(versionValue) {
  var value = String(versionValue || Date.now());
  var props = getScriptProps();
  props.setProperty("MRH_CACHE_VERSION", value);
  props.setProperty("CACHE_VER", value);
  props.setProperty("MRH_CACHE_VERSION_TIMESTAMP", new Date().toISOString());
  return value;
}

function getLastModificationTimestamp() {
  return getScriptProps().getProperty("LAST_MODIFICATION_TIMESTAMP") || "";
}

function generateCacheKey(input) {
  var version = getCacheInvalidationVersion();
  return "mrh_" + sha256Hex(String(input || "") + "::v" + version);
}

function getDeckSyncSummaryCacheKey_(cacheVersion, metadataVersion) {
  var safeVersion = String(cacheVersion || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  var safeMetadataVersion = String(metadataVersion || "0").replace(
    /[^a-zA-Z0-9_-]/g,
    "_",
  );
  return (
    "mrh_sync_summary_v1_" +
    safeVersion.slice(0, 100) +
    "_" +
    safeMetadataVersion.slice(0, 32)
  );
}

function buildDeckCacheKey(subject, accessMode) {
  var normalized = normalizeSubject(subject);
  var mode = String(accessMode || "authorized").trim() || "authorized";
  var version = getCacheInvalidationVersion();
  return "mrh_deck_" + sha256Hex(normalized + "::" + mode + "::v5::" + version);
}

function cachePutChunked(baseKey, content) {
  var cache = CacheService.getScriptCache();
  var text = String(content || "");
  var chunkCount = Math.max(1, Math.ceil(text.length / CACHE_CHUNK_SIZE));
  // The count key also consumes one of CacheService's 1,000 entries.
  if (chunkCount >= 1000) {
    LoggerService.log("WARN", mrhLoggerCategoryForFunction_("cachePutChunked"), "[cachePutChunked] Skipping oversized cache payload (" +
        chunkCount +
        " chunks).", { source: "migrated_structured_log", sourceLine: 6694 }, "cachePutChunked");
    return false;
  }

  try {
    var maxBatchBytes = 80000;
    var maxBatchChunks = 4;
    var chunks = [];
    for (
      var chunkStart = 0;
      chunkStart < text.length;
      chunkStart += CACHE_CHUNK_SIZE
    ) {
      var pendingChunks = [
        text.substring(chunkStart, chunkStart + CACHE_CHUNK_SIZE),
      ];
      while (pendingChunks.length) {
        var chunk = pendingChunks.shift();
        var entry = {};
        entry[baseKey + "_" + chunks.length] = chunk;
        if (
          Utilities.newBlob(JSON.stringify(entry)).getBytes().length >
          maxBatchBytes
        ) {
          if (chunk.length < 2)
            throw new Error("A cache chunk exceeds the batch payload limit.");
          var midpoint = Math.floor(chunk.length / 2);
          pendingChunks.unshift(chunk.substring(midpoint));
          pendingChunks.unshift(chunk.substring(0, midpoint));
          continue;
        }
        chunks.push(chunk);
        if (chunks.length >= 1000) {
          LoggerService.log("WARN", mrhLoggerCategoryForFunction_("cachePutChunked"), "[cachePutChunked] Skipping oversized cache payload (" +
              chunks.length +
              " chunks).", { source: "migrated_structured_log", sourceLine: 6731 }, "cachePutChunked");
          return false;
        }
      }
    }
    if (!chunks.length) chunks.push("");
    chunkCount = chunks.length;

    cache.remove(baseKey + "_count");
    var batchValues = Object.create(null);
    var batchChunkCount = 0;
    for (var i = 0; i < chunkCount; i++) {
      var candidateValues = Object.assign(Object.create(null), batchValues);
      candidateValues[baseKey + "_" + i] = chunks[i];
      if (
        batchChunkCount &&
        (batchChunkCount >= maxBatchChunks ||
          Utilities.newBlob(JSON.stringify(candidateValues)).getBytes().length >
            maxBatchBytes)
      ) {
        cache.putAll(batchValues, CACHE_TTL_SECONDS);
        batchValues = Object.create(null);
        batchChunkCount = 0;
      }
      batchValues[baseKey + "_" + i] = chunks[i];
      batchChunkCount += 1;
    }
    if (batchChunkCount) {
      cache.putAll(batchValues, CACHE_TTL_SECONDS);
    }
    cache.put(baseKey + "_count", String(chunkCount), CACHE_TTL_SECONDS);
    return true;
  } catch (error) {
    LoggerService.log("ERROR", "BUSINESS_LOGIC", "Cache write failed", {
      cacheKeyLength: String(baseKey || "").length,
      chunkCount: chunkCount,
    }, "cachePutChunked", error);
    return false;
  }
}

function cacheGetChunked(baseKey) {
  var cache = CacheService.getScriptCache();
  var countValue = cache.get(baseKey + "_count");
  if (!countValue) return null;
  var count = parseInt(countValue, 10);
  if (!Number.isFinite(count) || count < 1 || count > 1000) return null;

  var keys = [];
  for (var i = 0; i < count; i++) keys.push(baseKey + "_" + i);
  var cachedChunks = cache.getAll(keys);
  var orderedChunks = [];
  for (var j = 0; j < count; j++) {
    var chunk = cachedChunks[keys[j]];
    if (chunk === undefined || chunk === null) return null;
    orderedChunks[j] = chunk;
  }
  return orderedChunks.join("");
}

/* -------------------------------------------------------------------------- */
/* Rate limiting / authorization                                              */
/* -------------------------------------------------------------------------- */



/* -------------------------------------------------------------------------- */
/* UUID / access metadata                                                     */
/* -------------------------------------------------------------------------- */

function getOrInitializeUUIDSheet() {
  var ss = mrhLoggedSpreadsheetOpenById_(getMRHUuidSpreadsheetId_(), "UUID spreadsheet");
  var sheet = ss.getSheetByName("UUID") || ss.insertSheet("UUID");
  var header = [
    "UUID",
    "Subject",
    "Hidden",
    "Password",
    "CreatedAt",
    "SourceType",
    "SourceId",
  ];

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, UUID_SHEET_COLUMN_COUNT).setValues([header]);
    LoggerService.recordOperation_("spreadsheet.uuid.headerWrite", 1);
    LoggerService.log("INFO", "SPREADSHEET_OPS", "UUID sheet header created", {
      service: "SpreadsheetApp", operation: "setValues", sheetName: "UUID", range: "A1:G1", rowCount: 1,
      spreadsheetId: mrhLoggerSafeIdentifier_(ss.getId()),
    }, "getOrInitializeUUIDSheet");
  } else {
    var existingHeader = sheet
      .getRange(1, 1, 1, UUID_SHEET_COLUMN_COUNT)
      .getValues()[0];
    var headerMismatch = false;
    for (var h = 0; h < header.length; h++) {
      if (String(existingHeader[h] || "") !== header[h]) {
        headerMismatch = true;
        break;
      }
    }
    if (sheet.getLastColumn() < UUID_SHEET_COLUMN_COUNT || headerMismatch) {
      sheet.getRange(1, 1, 1, UUID_SHEET_COLUMN_COUNT).setValues([header]);
      LoggerService.recordOperation_("spreadsheet.uuid.headerWrite", 1);
      LoggerService.log("INFO", "SPREADSHEET_OPS", "UUID sheet header repaired", {
        service: "SpreadsheetApp", operation: "setValues", sheetName: "UUID", range: "A1:G1", rowCount: 1,
        spreadsheetId: mrhLoggerSafeIdentifier_(ss.getId()),
      }, "getOrInitializeUUIDSheet");
    }
  }

  LoggerService.log("DEBUG", "SPREADSHEET_OPS", "UUID sheet opened", {
    service: "SpreadsheetApp", operation: "open_or_initialize", sheetName: "UUID",
    spreadsheetId: mrhLoggerSafeIdentifier_(ss.getId()),
  }, "getOrInitializeUUIDSheet");
  return sheet;
}

function generateDeckUUID() {
  // Six-digit numeric IDs keep persisted deck cache filenames compact.
  // Collision handling remains enforced by readUUIDRecords/writeUUIDRecords.
  return String(Math.floor(100000 + Math.random() * 900000));
}

function readUUIDRecords() {
  ensureDeckPasswordHashMigration_();
  var sheet = getOrInitializeUUIDSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    LoggerService.log("DEBUG", "SPREADSHEET_OPS", "UUID records read", {
      service: "SpreadsheetApp", operation: "read_values", sheetName: "UUID", range: "empty_data_range", startRow: 2, endRow: 1, affectedRowCount: 0,
    }, "readUUIDRecords");
    return [];
  }

  var rows = sheet
    .getRange(2, 1, lastRow - 1, UUID_SHEET_COLUMN_COUNT)
    .getValues();
  LoggerService.recordOperation_("spreadsheet.uuid.rowsRead", rows.length);
  var bySubject = Object.create(null);
  var byUUID = Object.create(null);

  for (var i = 0; i < rows.length; i++) {
    var uuid = String(rows[i][0] || "").trim();
    var subject = normalizeSubject(rows[i][1]);
    if (!subject) continue;

    if (!uuid) uuid = "M-" + sha256Hex(subject).substring(0, 32).toUpperCase();
    if (bySubject[subject]) continue;
    if (byUUID[uuid]) {
      var correctedUuid =
        "M-" +
        sha256Hex(subject + "::collision")
          .substring(0, 30)
          .toUpperCase();
      if (byUUID[correctedUuid]) correctedUuid = generateDeckUUID();
      LoggerService.log("WARN", mrhLoggerCategoryForFunction_("readUUIDRecords"), "[readUUIDRecords] UUID collision detected for subject '" +
          subject +
          "'; deterministic replacement assigned.", { source: "migrated_structured_log", sourceLine: 6903 }, "readUUIDRecords");
      uuid = correctedUuid;
    }

    byUUID[uuid] = true;
    bySubject[subject] = {
      uuid: uuid,
      subject: subject,
      hidden: toBoolean(rows[i][2], false),
      password: normalizeStoredPassword(rows[i][3]),
      createdAt: rows[i][4] || new Date().toISOString(),
      sourceType: String(rows[i][5] || "")
        .trim()
        .toLowerCase(),
      sourceId: String(rows[i][6] || "").trim(),
    };
  }

  var outputRecords = Object.keys(bySubject).map(function (subject) {
    return bySubject[subject];
  });
  LoggerService.log("DEBUG", "SPREADSHEET_OPS", "UUID records read", {
    service: "SpreadsheetApp", operation: "getValues", sheetName: "UUID",
    range: "A2:G" + lastRow, affectedRowCount: rows.length, validRecordCount: outputRecords.length,
  }, "readUUIDRecords");
  return outputRecords;
}

/**
 * Atomic write: Overwrites existing rows first, then clears only the excess trailing rows.
 * Prevents reading an empty sheet if another thread executes between clear and write.
 */
/**
 * Run UUID metadata mutation under the project lock without holding it over the
 * cache builder's full Drive/Spreadsheet traversal. Callers that already own the
 * lock must explicitly pass alreadyLocked=true to avoid non-reentrant locking.
 */
function withUUIDMetadataMutationLock_(alreadyLocked, operationName, callback) {
  if (typeof callback !== "function") throw new Error("UUID metadata mutation callback is required.");
  if (alreadyLocked === true) return callback();

  // Resolve any one-time password-migration/backup work before acquiring the
  // non-reentrant script lock for read/modify/write helpers. The low-level
  // writer retains its historical ability to write directly without being a
  // migration entry point of its own.
  if (String(operationName || "") !== "writeUUIDRecords")
    ensureDeckPasswordHashMigration_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(BUILDER_LOCK_TIMEOUT_MS)) {
    var busyError = new Error("UUID metadata mutation lock is busy; retry the cache build.");
    busyError.code = "UUID_METADATA_LOCK_BUSY";
    busyError.operation = String(operationName || "UUID_METADATA_MUTATION");
    throw busyError;
  }
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function writeUUIDRecords(records, alreadyLocked) {
  return withUUIDMetadataMutationLock_(alreadyLocked === true, "writeUUIDRecords", function () {
    return writeUUIDRecordsUnlocked_(records);
  });
}

function writeUUIDRecordsUnlocked_(records) {
  var sheet = getOrInitializeUUIDSheet();
  var clean = [];
  var subjects = Object.create(null);
  var uuids = Object.create(null);

  for (var i = 0; i < records.length; i++) {
    var r = records[i] || {};
    var subject = normalizeSubject(r.subject);
    if (!subject || subjects[subject]) continue;

    var uuid = String(r.uuid || "").trim();
    if (!uuid || uuids[uuid]) uuid = generateUniqueDeckUUID_(uuids);
    else uuids[uuid] = true;

    subjects[subject] = true;

    clean.push({
      uuid: uuid,
      subject: subject,
      hidden: !!r.hidden,
      password: normalizePasswordForStorage_(r.password),
      createdAt: r.createdAt || new Date().toISOString(),
      sourceType: String(r.sourceType || "")
        .trim()
        .toLowerCase(),
      sourceId: String(r.sourceId || "").trim(),
    });
  }

  clean.sort(function (a, b) {
    return TextUtils.naturalSortStrings(a.subject, b.subject);
  });

  var values = [
    [
      "UUID",
      "Subject",
      "Hidden",
      "Password",
      "CreatedAt",
      "SourceType",
      "SourceId",
    ],
  ];
  for (var j = 0; j < clean.length; j++) {
    values.push([
      safeCellText(clean[j].uuid, 100),
      safeCellText(clean[j].subject, 500),
      clean[j].hidden ? "true" : "",
      cleanText(clean[j].password, 500),
      safeCellText(clean[j].createdAt, 100),
      safeCellText(clean[j].sourceType, 30),
      safeCellText(clean[j].sourceId, 200),
    ]);
  }

  var currentLastRow = sheet.getLastRow();
  // Do not set number formats across the UUID table: Google Sheets typed
  // columns reject setNumberFormat(). IDs are already supplied as strings.
  // 1. Write content directly over existing cells
  sheet
    .getRange(1, 1, values.length, UUID_SHEET_COLUMN_COUNT)
    .setValues(values);
  LoggerService.recordOperation_("spreadsheet.uuid.rowsWritten", clean.length);

  // 2. Clear only remaining obsolete rows below
  if (currentLastRow > values.length) {
    sheet
      .getRange(
        values.length + 1,
        1,
        currentLastRow - values.length,
        UUID_SHEET_COLUMN_COUNT,
      )
      .clearContent();
    LoggerService.recordOperation_("spreadsheet.uuid.rowsCleared", currentLastRow - values.length);
  }

  invalidateMetadataCache();
  LoggerService.log("INFO", "SPREADSHEET_OPS", "UUID records written", {
    service: "SpreadsheetApp", operation: "setValues_and_clearContent", sheetName: "UUID",
    writeRange: "A1:G" + values.length, affectedDataRows: clean.length,
    clearedRange: currentLastRow > values.length ? ("A" + (values.length + 1) + ":G" + currentLastRow) : "",
    clearedRowCount: Math.max(0, currentLastRow - values.length),
  }, "writeUUIDRecords");
  return clean;
}

function normalizeUUIDSheetParentSubjects(alreadyLocked) {
  return withUUIDMetadataMutationLock_(alreadyLocked === true, "normalizeUUIDSheetParentSubjects", function () {
    return normalizeUUIDSheetParentSubjectsUnlocked_();
  });
}

function normalizeUUIDSheetParentSubjectsUnlocked_() {
  var base = readUUIDRecords();
  var bySubject = Object.create(null);

  for (var i = 0; i < base.length; i++) bySubject[base[i].subject] = base[i];

  var originals = base.slice();
  for (var j = 0; j < originals.length; j++) {
    var parts = originals[j].subject.split("::");
    var current = "";
    for (var p = 0; p < parts.length - 1; p++) {
      current = current ? current + "::" + parts[p] : parts[p];
      if (!bySubject[current]) {
        bySubject[current] = {
          uuid: generateDeckUUID(),
          subject: current,
          hidden: false,
          password: "",
          createdAt: new Date().toISOString(),
          sourceType: "container",
          sourceId: "",
        };
      }
    }
  }

  return writeUUIDRecords(
    Object.keys(bySubject).map(function (key) {
      return bySubject[key];
    }),
    true,
  );
}

/**
 * Restore UUID metadata rows that disappeared from the sheet but still have a
 * prior snapshot. The subsequent live-source reconciliation removes entries
 * whose source no longer exists in Drive, while preserving IDs and access
 * settings for live sources whose rows were accidentally deleted or cleared.
 */
function restoreMissingUUIDMetadataFromBackup_(cacheFolder, alreadyLocked) {
  // Resolve Drive folder creation before taking the UUID-sheet mutation lock;
  // getOrCreateCacheFolder may itself need a short script-lock window.
  var resolvedCacheFolder = cacheFolder || getOrCreateCacheFolder(alreadyLocked === true);
  return withUUIDMetadataMutationLock_(alreadyLocked === true, "restoreMissingUUIDMetadataFromBackup_", function () {
    return restoreMissingUUIDMetadataFromBackupUnlocked_(resolvedCacheFolder);
  });
}

function restoreMissingUUIDMetadataFromBackupUnlocked_(cacheFolder) {
  if (getScriptProps().getProperty(PASSWORD_HASH_BACKUP_PENDING_PROPERTY) === "true") {
    var backupError = new Error("UUID metadata backup is stale; synchronize the password-hashed backup before attempting restoration.");
    backupError.code = "PASSWORD_HASH_BACKUP_STALE";
    throw backupError;
  }
  var folder = cacheFolder || getOrCreateCacheFolder();
  var backupFiles = findCacheFilesByName(
    folder,
    UUID_METADATA_BACKUP_FILE_NAME,
  );
  if (!backupFiles.hasNext()) return 0;

  var backupRecords;
  try {
    backupRecords = JSON.parse(
      backupFiles.next().getBlob().getDataAsString() || "",
    );
  } catch (error) {
    throw new Error(
      "UUID metadata backup is unreadable; rebuild stopped to avoid losing recoverable metadata.",
    );
  }
  if (
    !Array.isArray(backupRecords) ||
    !backupRecords.every(function (record) {
      return (
        record &&
        typeof record === "object" &&
        typeof record.subject === "string" &&
        typeof record.uuid === "string"
      );
    })
  )
    throw new Error(
      "UUID metadata backup has an unsupported format; rebuild stopped to protect metadata.",
    );

  var currentRecords = readUUIDRecords();
  var currentBySubject = Object.create(null);
  var currentBySource = Object.create(null);
  var backupBySubject = Object.create(null);
  var backupBySource = Object.create(null);
  var usedIds = Object.create(null);

  function sourceIdentity_(record) {
    var type = String(record.sourceType || "").trim().toLowerCase();
    var id = String(record.sourceId || "").trim();
    return type && id ? getSourceKey(type, id) : "";
  }

  function indexCurrentRecord_(record) {
    var subject = normalizeSubject(record.subject);
    var sourceKey = sourceIdentity_(record);
    if (subject) currentBySubject[subject] = record;
    if (sourceKey) currentBySource[sourceKey] = record;
  }

  function indexBackupRecord_(record) {
    var subject = normalizeSubject(record.subject);
    var sourceKey = sourceIdentity_(record);
    if (subject && !backupBySubject[subject]) backupBySubject[subject] = record;
    if (sourceKey && !backupBySource[sourceKey]) backupBySource[sourceKey] = record;
  }

  for (var i = 0; i < currentRecords.length; i++) {
    indexCurrentRecord_(currentRecords[i]);
    var currentId = String(currentRecords[i].uuid || "").trim();
    if (/^\d{6}$/.test(currentId)) usedIds[currentId] = true;
  }
  for (var b = 0; b < backupRecords.length; b++) indexBackupRecord_(backupRecords[b]);

  var changes = 0;

  // If an existing row's ID was cleared, made invalid, or displaced by a
  // duplicate, restore that row's prior valid ID when it is still available.
  // Valid user-entered six-digit IDs are left untouched.
  for (var c = 0; c < currentRecords.length; c++) {
    var current = currentRecords[c];
    var currentIdValue = String(current.uuid || "").trim();
    if (/^\d{6}$/.test(currentIdValue)) continue;

    var currentSubject = normalizeSubject(current.subject);
    var currentSourceKey = sourceIdentity_(current);
    var prior =
      (currentSourceKey && backupBySource[currentSourceKey]) ||
      backupBySubject[currentSubject];
    var priorId = String((prior && prior.uuid) || "").trim();
    if (/^\d{6}$/.test(priorId) && !usedIds[priorId]) {
      current.uuid = priorId;
      usedIds[priorId] = true;
      changes++;
    }
  }

  // Restore fully missing rows from the last successful snapshot. Rows for
  // deleted Drive sources are later removed by reconcileMetadataToLiveSources.
  var restoredRecords = [];
  for (var j = 0; j < backupRecords.length; j++) {
    var old = backupRecords[j];
    var subject = normalizeSubject(old.subject);
    if (!subject) continue;

    var sourceKey = sourceIdentity_(old);
    var matched =
      (sourceKey && currentBySource[sourceKey]) || currentBySubject[subject];
    if (matched) continue;

    var restoredId = String(old.uuid || "").trim();
    // Preserve current valid IDs if a manually edited row now conflicts with a
    // missing row's previous ID. The restored row gets a fresh unique ID instead.
    if (!/^\d{6}$/.test(restoredId) || usedIds[restoredId])
      restoredId = generateUniqueDeckUUID_(usedIds);
    else usedIds[restoredId] = true;

    var restored = {
      uuid: restoredId,
      subject: subject,
      hidden: toBoolean(old.hidden, false),
      password: normalizeStoredPassword(old.password),
      createdAt: old.createdAt || new Date().toISOString(),
      sourceType: String(old.sourceType || "").trim().toLowerCase(),
      sourceId: String(old.sourceId || "").trim(),
    };
    restoredRecords.push(restored);
    indexCurrentRecord_(restored);
  }

  if (restoredRecords.length) {
    currentRecords = currentRecords.concat(restoredRecords);
    changes += restoredRecords.length;
  }
  if (!changes) return 0;

  // writeUUIDRecords normalizes, deduplicates, sorts, and invalidates metadata.
  writeUUIDRecords(currentRecords, true);
  LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("indexBackupRecord_"), "[restoreMissingUUIDMetadataFromBackup_] Recovered " +
      changes +
      " missing/invalid metadata item(s); live-source reconciliation will remove stale sources.", { source: "migrated_structured_log", sourceLine: 7198 }, "indexBackupRecord_");
  return changes;
}

/** Persist the current normalized metadata as a recoverable snapshot. */
function writeUUIDMetadataBackup_(cacheFolder, alreadyLocked) {
  try {
    var folder = cacheFolder || getOrCreateCacheFolder(alreadyLocked === true);
    var records = readUUIDRecords();
    var file = updateOrCreateCacheFile(
      folder,
      UUID_METADATA_BACKUP_FILE_NAME,
      JSON.stringify(records),
    );
    return Boolean(file);
  } catch (error) {
    LoggerService.log("ERROR", "SPREADSHEET_OPS", "UUID metadata backup write failed", {
      fileName: UUID_METADATA_BACKUP_FILE_NAME,
    }, "writeUUIDMetadataBackup_", error);
    return false;
  }
}

function loadDeckMetadataMap(forceRefresh) {
  ensureDeckPasswordHashMigration_();
  var now = Date.now();
  if (
    !forceRefresh &&
    deckMetadataCache &&
    now - deckMetadataCacheTime < METADATA_CACHE_TTL_MS
  )
    return deckMetadataCache;

  var metadataCacheKey = "mrh_deck_metadata_v1";
  if (!forceRefresh) {
    try {
      var cachedRecords = CacheService.getScriptCache().get(metadataCacheKey);
      if (cachedRecords) {
        var parsedRecords = JSON.parse(cachedRecords);
        if (
          Array.isArray(parsedRecords) &&
          parsedRecords.every(function (record) {
            return (
              record &&
              typeof record.subject === "string" &&
              record.subject.length > 0 &&
              typeof record.uuid === "string"
            );
          })
        ) {
          var cachedMap = Object.create(null);
          for (
            var cachedIndex = 0;
            cachedIndex < parsedRecords.length;
            cachedIndex++
          )
            cachedMap[parsedRecords[cachedIndex].subject] =
              parsedRecords[cachedIndex];
          deckMetadataCache = cachedMap;
          deckMetadataCacheTime = now;
          return deckMetadataCache;
        }
        CacheService.getScriptCache().remove(metadataCacheKey);
      }
    } catch (cacheError) {
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("loadDeckMetadataMap"), "[loadDeckMetadataMap] Persistent metadata cache read failed.", { source: "migrated_structured_log", sourceLine: 7266 }, "loadDeckMetadataMap");
    }
  }

  var records = readUUIDRecords();
  var map = Object.create(null);
  for (var i = 0; i < records.length; i++) map[records[i].subject] = records[i];
  deckMetadataCache = map;
  deckMetadataCacheTime = now;
  try {
    var serializedRecords = JSON.stringify(records);
    if (serializedRecords.length <= 30000)
      CacheService.getScriptCache().put(
        metadataCacheKey,
        serializedRecords,
        Math.max(1, Math.floor(METADATA_CACHE_TTL_MS / 1000)),
      );
  } catch (cacheError) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("loadDeckMetadataMap"), "[loadDeckMetadataMap] Persistent metadata cache write failed.", { source: "migrated_structured_log", sourceLine: 7286 }, "loadDeckMetadataMap");
  }
  return map;
}

function getDeckMetadata(subject) {
  var normalized = normalizeSubject(subject);
  if (!normalized) return null;
  return loadDeckMetadataMap()[normalized] || null;
}

function getEffectivePassword(subject, metadataMap) {
  var normalized = normalizeSubject(subject);
  if (!normalized) return "";

  var map = metadataMap || loadDeckMetadataMap();
  var parts = normalized.split("::");
  var current = "";
  var inherited = "";

  for (var i = 0; i < parts.length; i++) {
    current = current ? current + "::" + parts[i] : parts[i];
    var record = map[current];
    if (record && String(record.password || "").trim())
      inherited = String(record.password || "").trim();
  }
  return inherited;
}

function isSubjectHiddenByHierarchy(subject, metadataMap) {
  var normalized = normalizeSubject(subject);
  if (!normalized) return false;

  var parts = normalized.split("::");
  var current = "";
  for (var i = 0; i < parts.length; i++) {
    current = current ? current + "::" + parts[i] : parts[i];
    var record = metadataMap[current];
    if (record && record.hidden === true) return true;
  }
  return false;
}

function ensureDeckUUID(subject, sourceType, sourceId, alreadyLocked) {
  // The cache builder visits every deck. Avoid acquiring a global lock when the
  // current metadata already has the complete record needed by this source.
  // Only a missing record or a source-identity repair enters the critical path.
  if (alreadyLocked === true)
    return ensureDeckUUIDUnlocked_(subject, sourceType, sourceId);
  ensureDeckPasswordHashMigration_();
  var normalized = normalizeSubject(subject);
  if (!normalized)
    throw new Error("Cannot generate a UUID for an empty subject.");
  var quickMap = loadDeckMetadataMap();
  var quickRecord = quickMap[normalized];
  var needsSourceRepair = Boolean(
    sourceType && sourceId && quickRecord &&
    (!quickRecord.sourceType || !quickRecord.sourceId)
  );
  if (quickRecord && quickRecord.uuid && !needsSourceRepair)
    return quickRecord.uuid;
  return withUUIDMetadataMutationLock_(false, "ensureDeckUUID", function () {
    // Do not reuse the pre-lock map: another invocation may have changed the
    // sheet after the optimistic lookup. The lock protects the fresh read/modify/write.
    invalidateMetadataCache();
    return ensureDeckUUIDUnlocked_(normalized, sourceType, sourceId);
  });
}

function ensureDeckUUIDUnlocked_(subject, sourceType, sourceId) {
  var normalized = normalizeSubject(subject);
  if (!normalized)
    throw new Error("Cannot generate a UUID for an empty subject.");

  var map = loadDeckMetadataMap();
  if (map[normalized] && map[normalized].uuid) {
    if (
      sourceType &&
      sourceId &&
      (!map[normalized].sourceType || !map[normalized].sourceId)
    ) {
      var existingRecords = readUUIDRecords();
      for (var i = 0; i < existingRecords.length; i++) {
        if (existingRecords[i].subject === normalized) {
          existingRecords[i].sourceType = sourceType;
          existingRecords[i].sourceId = sourceId;
          writeUUIDRecords(existingRecords, true);
          break;
        }
      }
    }
    return map[normalized].uuid;
  }

  if (sourceType && sourceId) {
    var recordsBySource = readUUIDRecords();
    for (var s = 0; s < recordsBySource.length; s++) {
      if (
        recordsBySource[s].sourceType === sourceType &&
        recordsBySource[s].sourceId === sourceId
      ) {
        recordsBySource[s].subject = normalized;
        writeUUIDRecords(recordsBySource, true);
        return recordsBySource[s].uuid;
      }
    }
  }

  var sheet = getOrInitializeUUIDSheet();
  var usedIds = Object.create(null);
  Object.keys(map).forEach(function (key) {
    if (map[key] && map[key].uuid) usedIds[String(map[key].uuid)] = true;
  });
  var uuid = generateUniqueDeckUUID_(usedIds);
  var createdAt = new Date().toISOString();
  var normalizedSourceType = String(sourceType || "")
    .trim()
    .toLowerCase();
  var normalizedSourceId = String(sourceId || "").trim();
  var uuidAppendRow = sheet.getLastRow() + 1;
  sheet.appendRow([
    safeCellText(uuid, 100),
    safeCellText(normalized, 500),
    "",
    "",
    safeCellText(createdAt, 100),
    safeCellText(normalizedSourceType, 30),
    safeCellText(normalizedSourceId, 200),
  ]);
  LoggerService.recordOperation_("spreadsheet.uuid.rowsAppended", 1);
  LoggerService.log("DEBUG", "SPREADSHEET_OPS", "UUID metadata row appended", {
    service: "SpreadsheetApp", operation: "appendRow", sheetName: "UUID",
    range: "A" + uuidAppendRow + ":G" + uuidAppendRow, affectedRowCount: 1, sourceType: normalizedSourceType,
  }, "ensureDeckUUID");

  // Keep this execution's in-memory index current so a build that adds many
  // subjects does not reread and rescan the full UUID sheet after every append.
  map[normalized] = {
    uuid: uuid,
    subject: normalized,
    hidden: false,
    password: "",
    createdAt: createdAt,
    sourceType: normalizedSourceType,
    sourceId: normalizedSourceId,
  };
  deckMetadataCache = map;
  deckMetadataCacheTime = Date.now();
  invalidatePersistentMetadataCache_();
  return uuid;
}

function generateDeckFileName(subject) {
  var record = getDeckMetadata(subject);
  if (!record || !record.uuid)
    throw new Error(
      "Deck metadata not found for subject: " + normalizeSubject(subject),
    );
  return "deck-" + record.uuid + ".json";
}

function generateUniqueDeckUUID_(usedIds) {
  var used = usedIds || Object.create(null);
  // Six-digit numeric IDs have 900,000 possible values. Fail explicitly rather
  // than silently creating duplicate IDs if the namespace is ever exhausted.
  for (var attempt = 0; attempt < 10000; attempt++) {
    var candidate = generateDeckUUID();
    if (/^\d{6}$/.test(candidate) && !used[candidate]) {
      used[candidate] = true;
      return candidate;
    }
  }
  throw new Error("Unable to allocate a unique six-digit deck ID.");
}

function normalizeMetadataRecordUUIDs(records) {
  // Reserve every already-valid ID before allocating replacements. This prevents
  // an invalid row early in the array from accidentally taking an ID belonging
  // to a valid row later in the array.
  var reserved = Object.create(null);
  var firstSeen = Object.create(null);
  for (var i = 0; i < records.length; i++) {
    var candidate = String(records[i].uuid || "").trim();
    if (/^\d{6}$/.test(candidate)) reserved[candidate] = true;
  }

  // Preserve the first occurrence of each valid ID; repair only invalid IDs and
  // subsequent duplicates. Existing valid, unique IDs remain stable.
  for (var j = 0; j < records.length; j++) {
    var current = String(records[j].uuid || "").trim();
    if (/^\d{6}$/.test(current) && !firstSeen[current]) {
      firstSeen[current] = true;
      continue;
    }
    records[j].uuid = generateUniqueDeckUUID_(reserved);
  }
}

/**
 * Compatibility repair for persisted deck IDs. Existing valid, unique six-digit
 * IDs are preserved; only invalid or duplicate IDs are replaced. The caller
 * forces a cache rebuild so files using repaired IDs are regenerated safely.
 */
function migrateDeckMetadataIdsToSixDigits_(alreadyLocked) {
  return withUUIDMetadataMutationLock_(alreadyLocked === true, "migrateDeckMetadataIdsToSixDigits_", function () {
    return migrateDeckMetadataIdsToSixDigitsUnlocked_();
  });
}

function migrateDeckMetadataIdsToSixDigitsUnlocked_() {
  var records = readUUIDRecords();
  var seen = Object.create(null);
  var needsMigration = false;
  var originalIds = [];
  for (var i = 0; i < records.length; i++) {
    var id = String(records[i].uuid || "").trim();
    originalIds.push(id);
    if (!/^\d{6}$/.test(id) || seen[id]) needsMigration = true;
    seen[id] = true;
  }
  if (!needsMigration) return false;

  normalizeMetadataRecordUUIDs(records);
  var repairedCount = 0;
  for (var j = 0; j < records.length; j++) {
    if (String(records[j].uuid || "").trim() !== originalIds[j]) repairedCount++;
  }
  // writeUUIDRecords also invalidates metadata caches; do not invalidate twice.
  writeUUIDRecords(records, true);
  LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("migrateDeckMetadataIdsToSixDigits_"), "[migrateDeckMetadataIdsToSixDigits_] Repaired " +
      repairedCount +
      " invalid or duplicate ID(s); preserved existing valid unique IDs.", { source: "migrated_structured_log", sourceLine: 7483 }, "migrateDeckMetadataIdsToSixDigits_");
  return true;
}

function getSourceKey(sourceType, sourceId) {
  return (
    String(sourceType || "")
      .trim()
      .toLowerCase() +
    "::" +
    String(sourceId || "").trim()
  );
}

function dedupeLiveSubjects(liveSources) {
  var seen = Object.create(null);
  var deduped = [];
  var duplicates = [];
  for (var i = 0; i < liveSources.length; i++) {
    var subject = normalizeSubject(liveSources[i].subject);
    if (!subject) continue;
    if (seen[subject]) {
      if (duplicates.indexOf(subject) === -1) duplicates.push(subject);
      continue;
    }
    seen[subject] = true;
    deduped.push(liveSources[i]);
  }
  return { deduped: deduped, duplicates: duplicates };
}

function recordDuplicateSubjectWarning(duplicates) {
  var props = getScriptProps();
  if (duplicates.length) {
    LoggerService.log("INFO", mrhLoggerCategoryForFunction_("recordDuplicateSubjectWarning"), "[reconcileMetadataToLiveSources] Duplicate logical subject(s) detected: " +
        duplicates.slice(0, 10).join(", ") +
        (duplicates.length > 10 ? " ..." : ""), { source: "migrated_structured_log", sourceLine: 7521 }, "recordDuplicateSubjectWarning");
    try {
      props.setProperty(
        "MRH_DUPLICATE_SUBJECTS",
        JSON.stringify(duplicates.slice(0, 50)),
      );
    } catch (persistError) {
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("recordDuplicateSubjectWarning"), "[reconcileMetadataToLiveSources] failed to persist duplicate warning: " +
          persistError, { source: "migrated_structured_log", sourceLine: 7532 }, "recordDuplicateSubjectWarning");
    }
  } else {
    props.deleteProperty("MRH_DUPLICATE_SUBJECTS");
  }
}

function reconcileMetadataToLiveSources(liveSources, alreadyLocked) {
  return withUUIDMetadataMutationLock_(alreadyLocked === true, "reconcileMetadataToLiveSources", function () {
    return reconcileMetadataToLiveSourcesUnlocked_(liveSources);
  });
}

function reconcileMetadataToLiveSourcesUnlocked_(liveSources) {
  var dedupeResult = dedupeLiveSubjects(liveSources);
  recordDuplicateSubjectWarning(dedupeResult.duplicates);
  liveSources = dedupeResult.deduped;

  var records = readUUIDRecords();
  var bySource = Object.create(null);
  var bySubject = Object.create(null);
  var result = [];
  var consumed = Object.create(null);

  for (var i = 0; i < records.length; i++) {
    var record = records[i];
    bySubject[record.subject] = record;
    if (record.sourceType && record.sourceId)
      bySource[getSourceKey(record.sourceType, record.sourceId)] = record;
  }

  for (var j = 0; j < liveSources.length; j++) {
    var live = liveSources[j];
    var key = getSourceKey(live.sourceType, live.sourceId);
    var existing = bySource[key] || null;
    if (!existing) existing = bySubject[live.subject] || null;

    if (existing) {
      result.push({
        uuid: existing.uuid,
        subject: live.subject,
        hidden: !!existing.hidden,
        password: String(existing.password || ""),
        createdAt: existing.createdAt || new Date().toISOString(),
        sourceType: live.sourceType,
        sourceId: live.sourceId,
      });
      consumed[existing.uuid] = true;
    } else {
      result.push({
        uuid: generateDeckUUID(),
        subject: live.subject,
        hidden: false,
        password: "",
        createdAt: new Date().toISOString(),
        sourceType: live.sourceType,
        sourceId: live.sourceId,
      });
    }
  }

  // Preserve explicit containers that still have live descendants.
  for (var k = 0; k < records.length; k++) {
    var old = records[k];
    if (consumed[old.uuid]) continue;
    if (old.sourceType === "container" || !old.sourceType) {
      var prefix = old.subject + "::";
      var hasLiveChild = false;
      for (var m = 0; m < liveSources.length; m++) {
        if (liveSources[m].subject.indexOf(prefix) === 0) {
          hasLiveChild = true;
          break;
        }
      }
      if (hasLiveChild) result.push(old);
    }
  }

  normalizeMetadataRecordUUIDs(result);

  var before = records
    .map(function (r) {
      return [
        r.uuid,
        r.subject,
        !!r.hidden,
        String(r.password || ""),
        r.createdAt || "",
        r.sourceType || "",
        r.sourceId || "",
      ].join("\u001f");
    })
    .sort()
    .join("\u001e");
  var after = result
    .map(function (r) {
      return [
        r.uuid,
        r.subject,
        !!r.hidden,
        String(r.password || ""),
        r.createdAt || "",
        r.sourceType || "",
        r.sourceId || "",
      ].join("\u001f");
    })
    .sort()
    .join("\u001e");

  if (before !== after) writeUUIDRecords(result, true);
  else invalidateMetadataCache();
  return loadDeckMetadataMap(true);
}

/* -------------------------------------------------------------------------- */
/* Summary encoding                                                           */
/* -------------------------------------------------------------------------- */

function analyzeQuestionTypes(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return "ID";
  var hasIdent = false;
  var hasMC = false;
  for (var i = 0; i < questions.length; i++) {
    var q = questions[i];
    if (q && q.t) {
      if (q.t === "ID") hasIdent = true;
      if (q.t === "MC") hasMC = true;
    }
  }
  if (hasIdent && hasMC) return "MX";
  if (hasMC) return "MC";
  return "ID";
}

function hasUsableExplanation(questions) {
  return (
    Array.isArray(questions) &&
    questions.some(function (question) {
      return (
        question && typeof question.e === "string" && question.e.trim() !== ""
      );
    })
  );
}

function buildSummaryArrayFromAccessState(state) {
  var metadata = loadDeckMetadataMap();
  var entries = [];
  var seen = Object.create(null);
  var summaryMap = state.summaryMap || {};

  for (var subject in summaryMap) {
    if (!Object.prototype.hasOwnProperty.call(summaryMap, subject)) continue;
    var normalized = normalizeSubject(subject);
    if (!normalized || seen[normalized]) continue;

    var record = metadata[normalized];
    if (!record) continue;
    if (isSubjectHiddenByHierarchy(normalized, metadata)) continue;

    var questionType =
      (state.questionTypes && state.questionTypes[subject]) || "ID";
    var hasExplanations = Boolean(
      state.hasExplanations && state.hasExplanations[subject],
    );
    seen[normalized] = true;
    entries.push({
      s: normalized,
      c: Number(summaryMap[subject] || 0),
      t: questionType,
      l: getEffectivePassword(subject, metadata) ? "t" : "f",
      e: hasExplanations ? "t" : "f",
      h: String(
        (state.payloadVersions && state.payloadVersions[subject]) || "",
      ),
    });
  }

  entries.sort(function (a, b) {
    return compareSubjectHierarchy(a.s, b.s);
  });
  return encodeSummaryDictionary(entries);
}

function encodeSummaryDictionary(entries) {
  var prefixes = [];
  var prefixIndexes = Object.create(null);
  var rows = [];
  var payloadVersions = [];

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i] || {};
    var subject = String(entry.s || "");
    var separatorIndex = subject.indexOf("::");
    var prefix =
      separatorIndex === -1 ? "" : subject.substring(0, separatorIndex);
    var suffix =
      separatorIndex === -1 ? subject : subject.substring(separatorIndex + 2);

    if (prefixIndexes[prefix] === undefined) {
      prefixIndexes[prefix] = prefixes.length;
      prefixes.push(prefix);
    }

    var row = [
      prefixIndexes[prefix],
      suffix,
      Number(entry.c || 0),
      entry.t || "ID",
    ];
    row.push(entry.l === "t" || entry.l === true ? 1 : 0);
    if (entry.e === "t" || entry.e === true) row.push(1);
    rows.push(row);
    payloadVersions.push(String(entry.h || ""));
  }
  return { v: 1, p: prefixes, d: rows, h: payloadVersions };
}

function decodeSummaryDictionary(data) {
  if (Array.isArray(data)) return data.length === 0 ? data : null;
  if (!data || data.v !== 1 || !Array.isArray(data.p) || !Array.isArray(data.d))
    return null;
  if (
    !Array.isArray(data.h) ||
    data.h.length !== data.d.length ||
    data.p.some(function (prefix) {
      return typeof prefix !== "string";
    }) ||
    data.h.some(function (fingerprint) {
      return !/^[a-f0-9]{64}$/i.test(String(fingerprint || ""));
    })
  )
    return null;

  var entries = [];
  for (var i = 0; i < data.d.length; i++) {
    var row = data.d[i];
    var prefixIndex = row && row[0];
    if (
      !Array.isArray(row) ||
      row.length < 5 ||
      row.length > 6 ||
      typeof prefixIndex !== "number" ||
      !Number.isInteger(prefixIndex) ||
      prefixIndex < 0 ||
      prefixIndex >= data.p.length ||
      typeof row[1] !== "string" ||
      !row[1].trim() ||
      typeof row[2] !== "number" ||
      !Number.isInteger(row[2]) ||
      row[2] < 0 ||
      typeof row[3] !== "string" ||
      !row[3].trim() ||
      (row[4] !== 0 && row[4] !== 1) ||
      (row.length === 6 && row[5] !== 1)
    )
      return null;
    var prefix = String(data.p[prefixIndex] || "");
    var suffix = row[1];
    entries.push({
      s: prefix ? prefix + "::" + suffix : suffix,
      c: row[2],
      t: row[3] || "ID",
      l: row[4] ? "t" : "f",
      e: row.length > 5 ? "t" : "f",
      h: Array.isArray(data.h) ? String(data.h[i] || "") : "",
    });
  }
  return entries;
}

/* -------------------------------------------------------------------------- */
/* Drive / database indexing & file storage helpers                           */
/* -------------------------------------------------------------------------- */

function getOrCreateCacheFolder(alreadyLocked) {
  var props = getScriptProps();
  var storedId = String(
    props.getProperty(CACHE_FOLDER_ID_PROPERTY) || "",
  ).trim();
  if (storedId) {
    try {
      return mrhLoggedDriveGetFolderById_(storedId);
    } catch (e) {
      props.deleteProperty(CACHE_FOLDER_ID_PROPERTY);
    }
  }

  var lock = null;
  var acquired = false;
  if (!alreadyLocked) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(BUILDER_LOCK_TIMEOUT_MS))
      throw new Error("Could not acquire cache-folder lock.");
    acquired = true;
  }
  try {
    storedId = String(props.getProperty(CACHE_FOLDER_ID_PROPERTY) || "").trim();
    if (storedId) {
      try {
        return mrhLoggedDriveGetFolderById_(storedId);
      } catch (e2) {
        LoggerService.log("WARN", "BUSINESS_LOGIC", "Cached Drive folder reference remained stale after lock acquisition", {
          service: "DriveApp", operation: "getFolderById", configuredFolderId: mrhLoggerSafeIdentifier_(storedId),
        }, "getOrCreateCacheFolder", e2);
        props.deleteProperty(CACHE_FOLDER_ID_PROPERTY);
      }
    }

    var root = mrhLoggedDriveGetFolderById_(getMRHRootFolderId_());
    var folders = root.getFoldersByName("MRH_Caches");
    if (folders.hasNext()) {
      var existing = folders.next();
      props.setProperty(CACHE_FOLDER_ID_PROPERTY, existing.getId());
      LoggerService.recordOperation_("drive.cacheFolder.reused", 1);
      LoggerService.log("DEBUG", "BUSINESS_LOGIC", "Drive cache folder reused", {
        service: "DriveApp", operation: "getFoldersByName", folderName: "MRH_Caches", folderId: mrhLoggerSafeIdentifier_(existing.getId()),
      }, "getOrCreateCacheFolder");
      return existing;
    }

    var created = root.createFolder("MRH_Caches");
    props.setProperty(CACHE_FOLDER_ID_PROPERTY, created.getId());
    LoggerService.recordOperation_("drive.cacheFolder.created", 1);
    LoggerService.log("INFO", "BUSINESS_LOGIC", "Drive cache folder created", {
      service: "DriveApp", operation: "createFolder", folderName: "MRH_Caches", folderId: mrhLoggerSafeIdentifier_(created.getId()), affectedFolderCount: 1,
    }, "getOrCreateCacheFolder");
    return created;
  } finally {
    if (acquired && lock) lock.releaseLock();
  }
}

function findCacheFilesByName(folder, fileName) {
  var startedAt = Date.now();
  try {
    var files = folder.getFilesByName(fileName);
    var hasMatch = files.hasNext(); // hasNext() does not consume the iterator.
    LoggerService.recordOperation_("drive.file.search", 1);
    LoggerService.log("DEBUG", "BUSINESS_LOGIC", "Drive cache file search completed", {
      service: "DriveApp", operation: "getFilesByName", fileName: mrhLoggerSafeText_(fileName, 160),
      folderId: (function () { try { return mrhLoggerSafeIdentifier_(folder.getId()); } catch (ignored) { return ""; } })(),
      hasMatch: hasMatch, durationMs: Date.now() - startedAt,
    }, "findCacheFilesByName");
    return files;
  } catch (error) {
    LoggerService.recordOperation_("drive.file.search.failure", 1);
    LoggerService.log("ERROR", "BUSINESS_LOGIC", "Drive cache file search failed", {
      service: "DriveApp", operation: "getFilesByName", fileName: mrhLoggerSafeText_(fileName, 160),
      durationMs: Date.now() - startedAt,
    }, "findCacheFilesByName", error);
    throw error;
  }
}

function readPersistentSummaryContent(cacheFolder) {
  try {
    var summaryFiles = findCacheFilesByName(cacheFolder, "MRH_Summary.json");
    if (!summaryFiles.hasNext()) return null;

    var content = String(summaryFiles.next().getBlob().getDataAsString() || "");
    if (!content.trim()) return null;

    var parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return content;
    if (
      parsed &&
      parsed.v === 1 &&
      Array.isArray(parsed.p) &&
      Array.isArray(parsed.d)
    ) {
      return content;
    }

    return null;
  } catch (error) {
    LoggerService.log("ERROR", "BUSINESS_LOGIC", "Persistent summary file could not be read or parsed", {
      fileName: "MRH_Summary.json",
    }, "readPersistentSummaryContent", error);
    return null;
  }
}

function updateOrCreateCacheFile(folder, fileName, contentStr) {
  var files = findCacheFilesByName(folder, fileName);
  var file = files.hasNext() ? files.next() : null;
  var content = String(contentStr || "");

  if (!file) {
    var createdFile = folder.createFile(fileName, content, MimeType.PLAIN_TEXT);
    LoggerService.recordOperation_("drive.cacheFile.created", 1);
    LoggerService.log("DEBUG", "BUSINESS_LOGIC", "Drive cache file created", {
      service: "DriveApp", operation: "createFile", fileName: fileName, fileId: mrhLoggerSafeIdentifier_(createdFile.getId()),
      contentBytes: mrhLoggerUtf8Length_(content), affectedFileCount: 1,
    }, "updateOrCreateCacheFile");
    return createdFile;
  }

  try {
    if (String(file.getBlob().getDataAsString() || "") === content) {
      var duplicateFilesRemoved = 0;
      while (files.hasNext()) { hardDeleteFile(files.next()); duplicateFilesRemoved += 1; }
      LoggerService.recordOperation_("drive.cacheFile.unchanged", 1);
      LoggerService.log("DEBUG", "BUSINESS_LOGIC", "Drive cache file unchanged", {
        service: "DriveApp", operation: "compare_content", fileName: fileName, fileId: mrhLoggerSafeIdentifier_(file.getId()),
        contentBytes: mrhLoggerUtf8Length_(content), duplicateFilesRemoved: duplicateFilesRemoved, affectedFileCount: duplicateFilesRemoved,
      }, "updateOrCreateCacheFile");
      return file;
    }
  } catch (e) {
    LoggerService.log("ERROR", "BUSINESS_LOGIC", "Existing Drive cache file could not be read before update", {
      fileName: fileName,
      contentBytes: mrhLoggerUtf8Length_(content),
    }, "updateOrCreateCacheFile", e);
  }

  file.setContent(content);
  var staleDuplicateFilesRemoved = 0;
  while (files.hasNext()) { hardDeleteFile(files.next()); staleDuplicateFilesRemoved += 1; }
  LoggerService.recordOperation_("drive.cacheFile.updated", 1);
  LoggerService.log("DEBUG", "BUSINESS_LOGIC", "Drive cache file updated", {
    service: "DriveApp", operation: "setContent", fileName: fileName, fileId: mrhLoggerSafeIdentifier_(file.getId()),
    contentBytes: mrhLoggerUtf8Length_(content), duplicateFilesRemoved: staleDuplicateFilesRemoved,
    affectedFileCount: 1 + staleDuplicateFilesRemoved,
  }, "updateOrCreateCacheFile");
  return file;
}

function hardDeleteFile(file) {
  if (!file) return;
  try {
    if (typeof Drive !== "undefined" && Drive.Files && Drive.Files.remove) {
      var removedFileId = mrhLoggerSafeIdentifier_(file.getId());
      Drive.Files.remove(file.getId());
      LoggerService.recordOperation_("drive.file.deleted", 1);
      LoggerService.log("DEBUG", "BUSINESS_LOGIC", "Drive cache file permanently deleted", {
        service: "Drive.Files", operation: "remove", fileId: removedFileId, affectedFileCount: 1,
      }, "hardDeleteFile");
      return;
    }
  } catch (e) {
    // Fall back to setTrashed below, but make the permission/API failure visible in logs.
    LoggerService.log("WARN", "BUSINESS_LOGIC", "Permanent Drive deletion failed; falling back to trash", {
      service: "Drive.Files", operation: "remove", fileId: (function () { try { return mrhLoggerSafeIdentifier_(file.getId()); } catch (ignored) { return ""; } })(),
    }, "hardDeleteFile", e);
  }
  try {
    var trashedFileId = mrhLoggerSafeIdentifier_(file.getId());
    file.setTrashed(true);
    LoggerService.recordOperation_("drive.file.trashed", 1);
    LoggerService.log("DEBUG", "BUSINESS_LOGIC", "Drive cache file moved to trash", {
      service: "DriveApp", operation: "setTrashed", fileId: trashedFileId, affectedFileCount: 1,
    }, "hardDeleteFile");
  } catch (ignored) {
    LoggerService.recordOperation_("drive.file.deleteFailure", 1);
    LoggerService.log("ERROR", "BUSINESS_LOGIC", "Drive cache file deletion failed", {
      service: "DriveApp", operation: "delete",
    }, "hardDeleteFile", ignored);
  }
}

/**
 * Storage helpers for large file indices: avoids hitting ScriptProperties 9KB limit.
 */
function readPersistentFileIndex(cacheFolder) {
  try {
    var files = findCacheFilesByName(cacheFolder, FILE_INDEX_FILE_NAME);
    if (!files.hasNext()) return { timestamps: {}, metadata: {} };
    var raw = files.next().getBlob().getDataAsString();
    var parsed = JSON.parse(raw);
    return {
      timestamps: parsed.timestamps || {},
      metadata: parsed.metadata || {},
    };
  } catch (e) {
    LoggerService.log("ERROR", "BUSINESS_LOGIC", "Persistent file index could not be read; returning an empty index", {
      fileName: FILE_INDEX_FILE_NAME,
    }, "readPersistentFileIndex", e);
    return { timestamps: {}, metadata: {} };
  }
}

function writePersistentFileIndex(cacheFolder, timestamps, metadata) {
  try {
    var payload = JSON.stringify({
      timestamps: timestamps || {},
      metadata: metadata || {},
    });
    updateOrCreateCacheFile(cacheFolder, FILE_INDEX_FILE_NAME, payload);
  } catch (e) {
    LoggerService.log("ERROR", "BUSINESS_LOGIC", "Persistent file index write failed", {
      fileName: FILE_INDEX_FILE_NAME,
    }, "writePersistentFileIndex", e);
  }
}

/* -------------------------------------------------------------------------- */
/* Question extraction (safely bound columns & formats)                       */
/* -------------------------------------------------------------------------- */

function normalizeSheetColor(value, fallback) {
  var v = String(value || fallback || "")
    .toLowerCase()
    .trim();
  if (v === "#fff") return "#ffffff";
  if (v === "#000") return "#000000";
  return v;
}

function detectAnswerIndex(backgrounds, fontWeights, fontColors, rowIndex) {
  var backgroundCandidates = [];
  var boldCandidates = [];
  var colorCandidates = [];

  var rowBg = (backgrounds && backgrounds[rowIndex]) || [];
  var rowWeight = (fontWeights && fontWeights[rowIndex]) || [];
  var rowColor = (fontColors && fontColors[rowIndex]) || [];

  for (var i = 0; i < 4; i++) {
    var bg = normalizeSheetColor(rowBg[i + 1], "#ffffff");
    var weight = String(rowWeight[i + 1] || "").toLowerCase();
    var color = normalizeSheetColor(rowColor[i + 1], "#000000");
    if (bg !== "#ffffff" && bg !== "transparent") backgroundCandidates.push(i);
    if (weight === "bold") boldCandidates.push(i);
    if (color !== "#000000" && color !== "#ffffff") colorCandidates.push(i);
  }

  if (backgroundCandidates.length === 1) return backgroundCandidates[0];
  if (boldCandidates.length === 1) return boldCandidates[0];
  if (colorCandidates.length === 1) return colorCandidates[0];
  return -1;
}

function answerTokenToIndex(value) {
  var token = String(value == null ? "" : value)
    .trim()
    .toUpperCase();

  if (!token) return -1;

  // Accept a plain letter token and tolerate a trailing period/parenthesis.
  token = token.replace(/[.)]$/, "");
  if (!/^[A-Z]+$/.test(token)) return -1;

  // A=0, B=1, ..., Z=25, AA=26, AB=27, ...
  var index = 0;
  for (var i = 0; i < token.length; i++) {
    index = index * 26 + (token.charCodeAt(i) - 64);
  }
  return index - 1;
}

function extractQuestionsOptimized(sheet, subjectName, warnings) {
  var db = [];
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return db;

  // Fixed layout:
  // A = Question
  // B-E = legacy choices A-D
  // F = Explanation
  // G = ImageURL
  // H = Answer letter (read-only; never modified)
  // I onward = additional choices E, F, G, H, ...
  // Read through the last populated column so I onward can contain additional choices.
  // getLastColumn() is content-based; formatting alone does not expand it.
  var readColumnCount = Math.max(1, sheet.getLastColumn());
  var range = sheet.getRange(1, 1, lastRow, readColumnCount);
  var data = range.getValues();
  LoggerService.recordOperation_("spreadsheet.questionSource.rowsRead", Math.max(0, lastRow - 1));
  LoggerService.log("DEBUG", "SPREADSHEET_OPS", "Question source range read", {
    service: "SpreadsheetApp",
    operation: "getValues_getBackgrounds_getFontWeights_getFontColors",
    sheetName: typeof sheet.getName === "function" ? sheet.getName() : "",
    startRow: 1,
    startColumn: 1,
    endRow: lastRow,
    endColumn: readColumnCount,
    sourceRowCount: lastRow,
    questionCandidateRowCount: Math.max(0, lastRow - 1),
    sourceColumnCount: readColumnCount,
  }, "extractQuestionsOptimized");
  var backgrounds = range.getBackgrounds();
  var fontWeights = range.getFontWeights();
  var fontColors = range.getFontColors();

  for (var j = 1; j < data.length; j++) {
    var row = data[j];
    if (!row || sheetCellText(row[0]) === "") continue;
    while (row.length < 8) row.push("");

    // Legacy choices remain B-E.
    var originalChoices = [
      sheetCellText(row[1]),
      sheetCellText(row[2]),
      sheetCellText(row[3]),
      sheetCellText(row[4]),
    ];

    // Additional choices are I onward. F/G/H are deliberately skipped.
    var hasExtraChoices = false;
    for (var extraCol = 8; extraCol < row.length; extraCol++) {
      var extraChoice = sheetCellText(row[extraCol]);
      originalChoices.push(extraChoice);
      if (extraChoice !== "") hasExtraChoices = true;
    }

    var answerIndex = -1;

    if (!hasExtraChoices) {
      // EXACT LEGACY PATH:
      // Preserve the existing B-E formatting-based answer detection for all
      // current four-choice / identification sheets.
      answerIndex = detectAnswerIndex(backgrounds, fontWeights, fontColors, j);

      // AUTO-FALLBACK FOR IDENTIFICATION:
      // If no format marker (bold/color/bg) was found, but exactly 1 choice exists
      // in B-E, automatically treat that non-empty choice as the answer.
      if (answerIndex < 0) {
        var nonEmptyChoiceIndices = [];
        for (var k = 0; k < originalChoices.length; k++) {
          if (originalChoices[k] !== "") nonEmptyChoiceIndices.push(k);
        }
        if (nonEmptyChoiceIndices.length === 1) {
          answerIndex = nonEmptyChoiceIndices[0];
        }
      }
    } else {
      // EXTENDED PATH (5+ choices):
      // H is the answer LETTER only. It is read, never written, and is never
      // treated as a choice column.
      answerIndex = answerTokenToIndex(row[7]);

      if (answerIndex < 0 || answerIndex >= originalChoices.length) {
        var extendedMsg =
          "Invalid Answer letter '" +
          String(row[7] || "") +
          "' for " +
          subjectName +
          " row " +
          (j + 1) +
          "; expected A-" +
          String.fromCharCode(64 + Math.min(originalChoices.length, 26)) +
          ". Skipping row.";

        LoggerService.log("INFO", mrhLoggerCategoryForFunction_("extractQuestionsOptimized"), "[extractQuestionsOptimized] " + extendedMsg, { source: "migrated_structured_log", sourceLine: 8174 }, "extractQuestionsOptimized");
        if (Array.isArray(warnings))
          warnings.push({
            subject: subjectName,
            row: j + 1,
            reason: extendedMsg,
          });
        continue;
      }
    }

    if (answerIndex < 0) {
      var msg1 =
        "Invalid answer marker for " +
        subjectName +
        " row " +
        (j + 1) +
        "; skipping row.";
      LoggerService.log("INFO", mrhLoggerCategoryForFunction_("extractQuestionsOptimized"), "[extractQuestionsOptimized] " + msg1, { source: "migrated_structured_log", sourceLine: 8192 }, "extractQuestionsOptimized");
      if (Array.isArray(warnings))
        warnings.push({ subject: subjectName, row: j + 1, reason: msg1 });
      continue;
    }

    // Remove empty choice cells while preserving the logical answer index.
    var choices = [];
    var mappedAnswerIndex = -1;
    for (var c = 0; c < originalChoices.length; c++) {
      if (originalChoices[c] === "") continue;
      if (c === answerIndex) mappedAnswerIndex = choices.length;
      choices.push(originalChoices[c]);
    }

    if (!choices.length || mappedAnswerIndex < 0) {
      var msg2 =
        "Answer marker points to an empty choice for " +
        subjectName +
        " row " +
        (j + 1) +
        "; skipping row.";
      LoggerService.log("INFO", mrhLoggerCategoryForFunction_("extractQuestionsOptimized"), "[extractQuestionsOptimized] " + msg2, { source: "migrated_structured_log", sourceLine: 8214 }, "extractQuestionsOptimized");
      if (Array.isArray(warnings))
        warnings.push({ subject: subjectName, row: j + 1, reason: msg2 });
      continue;
    }

    var questionType = choices.length <= 1 ? "ID" : "MC";
    var question = {
      i: j,
      q: sheetCellText(row[0]),
      c: choices,
      a: mappedAnswerIndex,
      t: questionType,
    };

    // F = Explanation; G = ImageURL.
    // H remains an external/read-only answer-letter source for 5+ choice rows.
    var explanation = sheetCellText(row[5]);
    var imageUrl = sheetCellText(row[6]);
    if (explanation) question.e = explanation;
    if (imageUrl) question.u = imageUrl;
    db.push(question);
  }

  return db;
}

function encodeDeckQuestions(questions) {
  return (Array.isArray(questions) ? questions : []).map(function (question) {
    var row = [question.i, question.q, question.c, question.a, question.t];
    if (question.e || question.u) row.push(question.e || null);
    if (question.u) row.push(question.u);
    while (row.length > 5 && row[row.length - 1] === null) row.pop();
    return row;
  });
}

var DECK_PAGE_STORAGE_SIZE_ = 500;

function getDeckPageManifestFileName_(uuid) {
  // Manifest is JSON too; use the same six-digit deck ID as the page files.
  return String(uuid || "") + "-deck.json";
}

function getDeckPageStorageFileName_(uuid, payloadVersion, page) {
  // 500-question chunks need a page index to avoid filename collisions.
  // Example: 482193-page-1.json, 482193-page-2.json.
  // payloadVersion remains in the signature for call-site compatibility.
  return String(uuid || "") + "-page-" + String(page) + ".json";
}

function getLegacyDeckPageManifestFileName_(uuid) {
  return "deck-" + String(uuid || "") + ".pages.json";
}

function getLegacyDeckPageStorageFileName_(uuid, payloadVersion, page) {
  return (
    "deck-" + String(uuid || "") + ".page-" +
    String(payloadVersion || "") + "-" + page + ".json"
  );
}

function readDeckPageManifest_(folder, uuid) {
  var manifestFiles = findCacheFilesByName(folder, getDeckPageManifestFileName_(uuid));
  var legacyFormat = false;
  if (!manifestFiles.hasNext()) {
    manifestFiles = findCacheFilesByName(folder, getLegacyDeckPageManifestFileName_(uuid));
    legacyFormat = true;
  }
  if (!manifestFiles.hasNext()) return null;
  try {
    var manifest = JSON.parse(manifestFiles.next().getBlob().getDataAsString());
    if (
      !manifest ||
      manifest.pageSize !== DECK_PAGE_STORAGE_SIZE_ ||
      !/^[a-f0-9]{64}$/i.test(String(manifest.payloadVersion || "")) ||
      !Number.isSafeInteger(manifest.totalCount) || manifest.totalCount < 0 ||
      manifest.totalPages !== Math.ceil(manifest.totalCount / DECK_PAGE_STORAGE_SIZE_)
    ) return null;
    // Internal-only marker tells the reader which page filename convention to use.
    manifest._legacyFormat = legacyFormat;
    return manifest;
  } catch (error) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("readDeckPageManifest_"), "[deck_page_storage] Invalid persisted page manifest.", { source: "migrated_structured_log", sourceLine: 8297 }, "readDeckPageManifest_");
    return null;
  }
}

function deleteDeckPageStorageFiles_(folder, uuid, payloadVersion, pageCount, legacyFormat) {
  for (var page = 1; page <= pageCount; page++) {
    var names = legacyFormat
      ? [getLegacyDeckPageStorageFileName_(uuid, payloadVersion, page)]
      : [getDeckPageStorageFileName_(uuid, payloadVersion, page)];
    for (var n = 0; n < names.length; n++) {
      var pageFiles = findCacheFilesByName(folder, names[n]);
      while (pageFiles.hasNext()) hardDeleteFile(pageFiles.next());
    }
  }
}

function writeDeckPageFiles_(folder, uuid, questions, payloadVersion) {
  var list = Array.isArray(questions) ? questions : [];
  var version = String(payloadVersion || "").trim();
  if (!/^[a-f0-9]{64}$/i.test(version)) version = sha256Hex(JSON.stringify(list));
  var previousManifest = readDeckPageManifest_(folder, uuid);
  var pageCount = Math.ceil(list.length / DECK_PAGE_STORAGE_SIZE_);

  for (var pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    updateOrCreateCacheFile(
      folder,
      getDeckPageStorageFileName_(uuid, version, pageIndex + 1),
      JSON.stringify(list.slice(pageIndex * DECK_PAGE_STORAGE_SIZE_, (pageIndex + 1) * DECK_PAGE_STORAGE_SIZE_)),
    );
  }

  // Publish the manifest only after all new page files are written.
  updateOrCreateCacheFile(
    folder,
    getDeckPageManifestFileName_(uuid),
    JSON.stringify({
      pageSize: DECK_PAGE_STORAGE_SIZE_,
      totalCount: list.length,
      totalPages: pageCount,
      payloadVersion: version,
    }),
  );

  if (previousManifest) {
    if (previousManifest._legacyFormat) {
      // Old page filenames include the payload hash; remove them after publication.
      deleteDeckPageStorageFiles_(
        folder, uuid, previousManifest.payloadVersion,
        previousManifest.totalPages, true,
      );
      var oldManifests = findCacheFilesByName(folder, getLegacyDeckPageManifestFileName_(uuid));
      while (oldManifests.hasNext()) hardDeleteFile(oldManifests.next());
    } else {
      // New filenames are stable by ID + page number. Do not delete pages that
      // were just overwritten; only remove pages that no longer exist.
      for (var stalePage = pageCount + 1; stalePage <= previousManifest.totalPages; stalePage++) {
        var staleFiles = findCacheFilesByName(
          folder, getDeckPageStorageFileName_(uuid, version, stalePage),
        );
        while (staleFiles.hasNext()) hardDeleteFile(staleFiles.next());
      }
    }
  }
}

function removeDeckPageFiles_(folder, uuid) {
  var manifest = readDeckPageManifest_(folder, uuid);
  if (manifest) {
    deleteDeckPageStorageFiles_(folder, uuid, manifest.payloadVersion, manifest.totalPages, manifest._legacyFormat);
  }
  // Remove all supported manifest variants, including invalid legacy manifests.
  [getDeckPageManifestFileName_(uuid), getLegacyDeckPageManifestFileName_(uuid)].forEach(function(name) {
    var files = findCacheFilesByName(folder, name);
    while (files.hasNext()) hardDeleteFile(files.next());
  });
  // Sweep both page conventions if a manifest was missing or corrupt.
  var allFiles = folder.getFiles();
  var escaped = String(uuid || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var pagePattern = new RegExp("^" + escaped + "-page-\\d+\\.json$", "i");
  var legacyPagePattern = new RegExp("^deck-" + escaped + "\\.page-.*\\.json$", "i");
  while (allFiles.hasNext()) {
    var file = allFiles.next();
    var name = file.getName();
    if (pagePattern.test(name) || legacyPagePattern.test(name)) hardDeleteFile(file);
  }
}

/* -------------------------------------------------------------------------- */
/* Pagination & Deck Retrieval                                                */
/* -------------------------------------------------------------------------- */

function getDeckJsonContent(subject) {
  var folder = getOrCreateCacheFolder();
  var fileName = generateDeckFileName(subject);
  var files = findCacheFilesByName(folder, fileName);
  if (!files.hasNext()) return null;
  return files.next().getBlob().getDataAsString();
}

function parseDeckPagination_(data) {
  var hasPage = data.page !== undefined && data.page !== "";
  var hasLimit = data.limit !== undefined && data.limit !== "";
  if (!hasPage && !hasLimit) return null;

  var pageValue = hasPage ? String(data.page) : "1";
  var limitValue = hasLimit ? String(data.limit) : "100";
  if (!/^[1-9]\d*$/.test(pageValue) || !/^[1-9]\d*$/.test(limitValue)) {
    return { error: "Deck page and limit must be positive integers." };
  }

  var page = Number(pageValue);
  var limit = Number(limitValue);
  if (!isFinite(page) || page > 1000000) {
    return { error: "Deck page is outside the supported range." };
  }
  if (!isFinite(limit) || limit > 100) {
    return { error: "Deck page limit must be between 1 and 100." };
  }
  return { page: page, limit: limit };
}

function sliceDeckJsonPage_(json, page, limit) {
  var text = String(json || "");
  var index = 0;
  while (index < text.length && /\s/.test(text.charAt(index))) index++;
  if (text.charAt(index) !== "[") {
    throw new Error("Cached deck payload is not a JSON array.");
  }
  index++;

  var startOffset = (page - 1) * limit;
  var endOffset = startOffset + limit;
  var questions = [];
  var totalCount = 0;
  var length = text.length;

  while (index < length) {
    while (index < length && /\s/.test(text.charAt(index))) index++;
    if (text.charAt(index) === "]") {
      index++;
      delimiter = "]";
      break;
    }
    if (index >= length) break;

    var itemStart = index;
    var nestingDepth = 0;
    var inString = false;
    var escaped = false;
    var delimiter = "";
    for (; index < length; index++) {
      var character = text.charAt(index);
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }
      if (character === '"') {
        inString = true;
      } else if (character === "[" || character === "{") {
        nestingDepth++;
      } else if (character === "]" || character === "}") {
        if (nestingDepth === 0) {
          if (character !== "]") {
            throw new Error("Malformed cached deck payload.");
          }
          delimiter = "]";
          break;
        }
        nestingDepth--;
      } else if (character === "," && nestingDepth === 0) {
        delimiter = ",";
        break;
      }
    }

    if (inString || nestingDepth !== 0 || !delimiter) {
      throw new Error("Malformed cached deck payload.");
    }
    if (totalCount >= startOffset && totalCount < endOffset) {
      questions.push(JSON.parse(text.substring(itemStart, index)));
    }
    totalCount++;

    if (delimiter === "]") {
      index++;
      break;
    }
    index++;
  }

  while (index < length && /\s/.test(text.charAt(index))) index++;
  if (index < length || delimiter !== "]") {
    throw new Error("Malformed cached deck payload.");
  }
  return {
    questions: questions,
    page: page,
    pageSize: limit,
    totalCount: totalCount,
    totalPages: Math.ceil(totalCount / limit),
    nextPage: page * limit < totalCount ? page + 1 : null,
    hasMore: page * limit < totalCount,
  };
}

function getDeckContent_(subject, baseKey) {
  var cached = cacheGetChunked(baseKey);
  if (cached !== null) return cached;
  var content = getDeckJsonContent(subject);
  if (content !== null) cachePutChunked(baseKey, content);
  return content;
}

function queueDeckPageStorageMigration_() {
  var props = getScriptProps();
  var retryAfter = Number(
    props.getProperty("MRH_DECK_PAGE_STORAGE_MIGRATION_RETRY_AFTER") || 0,
  );
  if (
    props.getProperty("MRH_DECK_PAGE_STORAGE_VERSION") === "1" ||
    props.getProperty("MRH_DECK_PAGE_STORAGE_MIGRATION_QUEUED") === "true" ||
    props.getProperty("BUILD_STATUS") === "RUNNING" ||
    retryAfter > Date.now()
  ) {
    return;
  }

  props.setProperty("FORCE_REBUILD", "true");
  try {
    if (ensureResumeBuildTrigger()) {
      props.setProperty("MRH_DECK_PAGE_STORAGE_MIGRATION_QUEUED", "true");
      props.deleteProperty("MRH_DECK_PAGE_STORAGE_MIGRATION_RETRY_AFTER");
    } else {
      props.setProperty(
        "MRH_DECK_PAGE_STORAGE_MIGRATION_RETRY_AFTER",
        String(Date.now() + 60000),
      );
    }
  } catch (error) {
    props.setProperty(
      "MRH_DECK_PAGE_STORAGE_MIGRATION_RETRY_AFTER",
      String(Date.now() + 300000),
    );
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("queueDeckPageStorageMigration_"), "[get_deck_page] Page storage migration scheduling failed: " + error, { source: "migrated_structured_log", sourceLine: 8547 }, "queueDeckPageStorageMigration_");
  }
}

function getDeckPayloadVersion_(content, baseKey) {
  var versionKey = baseKey + "_fingerprint_v1";
  var cachedVersion = cacheGetChunked(versionKey);
  if (/^[a-f0-9]{64}$/i.test(String(cachedVersion || ""))) {
    return cachedVersion;
  }
  var version = sha256Hex(content);
  cachePutChunked(versionKey, version);
  return version;
}

function getDeckPageFromFiles_(uuid, page, limit) {
  if (!uuid) return null;
  var folder = getOrCreateCacheFolder();
  var manifest = readDeckPageManifest_(folder, uuid);
  if (!manifest) return null;

  var startOffset = (page - 1) * limit;
  var endOffset = Math.min(startOffset + limit, manifest.totalCount);
  var questions = [];
  if (startOffset < endOffset) {
    var firstStoragePage =
      Math.floor(startOffset / DECK_PAGE_STORAGE_SIZE_) + 1;
    var lastStoragePage =
      Math.floor((endOffset - 1) / DECK_PAGE_STORAGE_SIZE_) + 1;
    for (
      var storagePage = firstStoragePage;
      storagePage <= lastStoragePage;
      storagePage++
    ) {
      var pageFileName = manifest._legacyFormat
        ? getLegacyDeckPageStorageFileName_(uuid, manifest.payloadVersion, storagePage)
        : getDeckPageStorageFileName_(uuid, manifest.payloadVersion, storagePage);
      var pageFiles = findCacheFilesByName(folder, pageFileName);
      if (!pageFiles.hasNext()) return null;
      var storedQuestions;
      try {
        storedQuestions = JSON.parse(
          pageFiles.next().getBlob().getDataAsString(),
        );
      } catch (error) {
        LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("getDeckPageFromFiles_"), "[get_deck_page] Invalid persisted question page.", { source: "migrated_structured_log", sourceLine: 8594 }, "getDeckPageFromFiles_");
        return null;
      }
      if (
        !Array.isArray(storedQuestions) ||
        storedQuestions.length !==
          Math.min(
            DECK_PAGE_STORAGE_SIZE_,
            manifest.totalCount - (storagePage - 1) * DECK_PAGE_STORAGE_SIZE_,
          )
      ) {
        return null;
      }
      var pageStart = (storagePage - 1) * DECK_PAGE_STORAGE_SIZE_;
      var localStart = Math.max(0, startOffset - pageStart);
      var localEnd = Math.min(storedQuestions.length, endOffset - pageStart);
      questions = questions.concat(storedQuestions.slice(localStart, localEnd));
    }
  }

  return {
    questions: questions,
    page: page,
    pageSize: limit,
    totalCount: manifest.totalCount,
    totalPages: Math.ceil(manifest.totalCount / limit),
    nextPage: page * limit < manifest.totalCount ? page + 1 : null,
    hasMore: page * limit < manifest.totalCount,
    payloadVersion: manifest.payloadVersion,
  };
}

function getPasswordRateLimitKey_(subject) {
  var normalized = normalizeSubject(subject);
  var clientIdentifier = "anon";
  try {
    clientIdentifier = String(Session.getTemporaryActiveUserKey() || "").trim() || "anon";
  } catch (ignored) {}
  // Persist only a one-way identifier; never send the raw subject or user key to Supabase.
  return sha256Hex(normalized + ":" + clientIdentifier);
}

function applyPersistentPasswordRateLimit_(subject, consume) {
  var identityHash = getPasswordRateLimitKey_(subject);
  if (!/^[a-f0-9]{64}$/.test(identityHash)) return false;
  try {
    var result = mrhSupabaseRpc_(MRH_SUPABASE_RATE_LIMIT_RPC, {
      p_scope: "deck_password",
      p_identity_hash: identityHash,
      p_event_hash: null,
      p_consume: consume === true,
    });
    return Boolean(result && result.allowed === true);
  } catch (error) {
    LoggerService.log(
      "ERROR",
      "API_CALL",
      "Persistent deck-password rate-limit check failed closed",
      { errorName: String((error && error.name) || "Error"), errorCode: String((error && error.code) || "RATE_LIMIT_STORE_UNAVAILABLE") },
      "applyPersistentPasswordRateLimit_",
      error,
    );
    return false;
  }
}

function checkPasswordRateLimit(subject) {
  // Atomically consume one failed attempt; false means limit reached or store unavailable.
  return applyPersistentPasswordRateLimit_(subject, true);
}

function isPasswordRateLimited(subject) {
  // A non-consuming transactional read of the same persistent counter.
  return !applyPersistentPasswordRateLimit_(subject, false);
}

function handleGetDeckRequest(data) {
  var subject = normalizeSubject(data.subject || "");
  if (!subject) return errorResponse("Subject is required.", "BAD_REQUEST");

  var pagination = parseDeckPagination_(data);
  if (pagination && pagination.error) {
    return errorResponse(pagination.error, "BAD_REQUEST");
  }

  var metadataMap = loadDeckMetadataMap();
  var metadata = metadataMap[subject];
  if (isSubjectHiddenByHierarchy(subject, metadataMap))
    return errorResponse("This deck is not available.", "FORBIDDEN");
  if (!metadataMap[subject])
    return errorResponse("This deck was not found.", "NOT_FOUND");

  var requiredPassword = getEffectivePassword(subject, metadataMap);
  if (requiredPassword) {
    if (isPasswordRateLimited(subject))
      return errorResponse(
        "Too many access attempts. Please try again later.",
        "RATE_LIMITED",
      );
    if (!verifyDeckPassword_(data.password, requiredPassword, subject, metadataMap)) {
      if (!checkPasswordRateLimit(subject))
        return errorResponse(
          "Too many access attempts. Please try again later.",
          "RATE_LIMITED",
        );
      return errorResponse("Incorrect Password.", "UNAUTHORIZED");
    }
  }

  var baseKey = buildDeckCacheKey(subject, "authorized");
  if (pagination) {
    var pageKey =
      baseKey + "_page_v1_" + pagination.limit + "_" + pagination.page;
    var pageStartedAt = Date.now();
    var cacheLookupStartedAt = Date.now();
    var cachedPage = cacheGetChunked(pageKey);
    var cacheLookupMs = Date.now() - cacheLookupStartedAt;
    if (cachedPage !== null) {
      LoggerService.log("INFO", mrhLoggerCategoryForFunction_("handleGetDeckRequest"), "[get_deck_page] page=" +
          pagination.page +
          " limit=" +
          pagination.limit +
          " storageMode=cache" +
          " responseBytes=" +
          Utilities.newBlob(cachedPage).getBytes().length +
          " cacheLookupMs=" +
          cacheLookupMs +
          " elapsedMs=" +
          (Date.now() - pageStartedAt), { source: "migrated_structured_log", sourceLine: 8692 }, "handleGetDeckRequest");
      return ContentService.createTextOutput(cachedPage).setMimeType(
        ContentService.MimeType.JSON,
      );
    }

    var sourceStartedAt = Date.now();
    var pagedResponse = getDeckPageFromFiles_(
      metadata.uuid,
      pagination.page,
      pagination.limit,
    );
    var storageMode = pagedResponse ? "persisted-page" : "legacy-scan";
    if (!pagedResponse) queueDeckPageStorageMigration_();
    var deckContent = null;
    if (!pagedResponse) {
      deckContent = getDeckContent_(subject, baseKey);
    }
    var pageStorageLoadMs = Date.now() - sourceStartedAt;
    if (!pagedResponse && deckContent === null) {
      return errorResponse("Deck data is not available yet.", "NOT_READY");
    }
    var pageParseMs = 0;
    if (!pagedResponse) {
      var pageParseStartedAt = Date.now();
      pagedResponse = sliceDeckJsonPage_(
        deckContent,
        pagination.page,
        pagination.limit,
      );
      pagedResponse.payloadVersion = getDeckPayloadVersion_(
        deckContent,
        baseKey,
      );
      pageParseMs = Date.now() - pageParseStartedAt;
    }
    var serializedPage = JSON.stringify(pagedResponse);
    cachePutChunked(pageKey, serializedPage);
    LoggerService.log("INFO", mrhLoggerCategoryForFunction_("handleGetDeckRequest"), "[get_deck_page] page=" +
        pagination.page +
        " limit=" +
        pagination.limit +
        " total=" +
        pagedResponse.totalCount +
        " storageMode=" +
        storageMode +
        " sourceChars=" +
        (deckContent ? deckContent.length : 0) +
        " responseBytes=" +
        Utilities.newBlob(serializedPage).getBytes().length +
        " cacheLookupMs=" +
        cacheLookupMs +
        " pageStorageLoadMs=" +
        pageStorageLoadMs +
        " pageScanParseMs=" +
        pageParseMs +
        " elapsedMs=" +
        (Date.now() - pageStartedAt), { source: "migrated_structured_log", sourceLine: 8742 }, "handleGetDeckRequest");
    return ContentService.createTextOutput(serializedPage).setMimeType(
      ContentService.MimeType.JSON,
    );
  }

  var cached = cacheGetChunked(baseKey);
  if (cached !== null) {
    return ContentService.createTextOutput(cached).setMimeType(
      ContentService.MimeType.JSON,
    );
  }

  var content = getDeckJsonContent(subject);
  if (content === null)
    return errorResponse("Deck data is not available yet.", "NOT_READY");

  cachePutChunked(baseKey, content);
  return ContentService.createTextOutput(content).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function handleVerifyAccessRequest(data) {
  var subject = normalizeSubject(data.subject || "");
  if (!subject) return errorResponse("Subject is required.", "BAD_REQUEST");

  var metadataMap = loadDeckMetadataMap();
  if (isSubjectHiddenByHierarchy(subject, metadataMap))
    return errorResponse("This deck is not available.", "FORBIDDEN");
  if (!metadataMap[subject])
    return errorResponse("This deck was not found.", "NOT_FOUND");

  var requiredPassword = getEffectivePassword(subject, metadataMap);
  if (requiredPassword) {
    if (isPasswordRateLimited(subject))
      return errorResponse(
        "Too many access attempts. Please try again later.",
        "RATE_LIMITED",
      );
    if (!verifyDeckPassword_(data.password, requiredPassword, subject, metadataMap)) {
      if (!checkPasswordRateLimit(subject))
        return errorResponse(
          "Too many access attempts. Please try again later.",
          "RATE_LIMITED",
        );
      return errorResponse("Incorrect Password.", "UNAUTHORIZED");
    }
  }

  return jsonResponse({ status: "success", subject: subject });
}

/* -------------------------------------------------------------------------- */
/* Public GET API                                                             */
/* -------------------------------------------------------------------------- */

function parseMRHLegacyTimestamp_(dateValue, timeValue) {
  var dateText = String(dateValue || "").trim();
  var timeText = String(timeValue || "").trim();
  var dateMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dateText);
  var timeMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(timeText);
  if (!dateMatch || !timeMatch) return "";
  var year = Number(dateMatch[1]);
  var month = Number(dateMatch[2]);
  var day = Number(dateMatch[3]);
  var hour = Number(timeMatch[1]);
  var minute = Number(timeMatch[2]);
  var second = Number(timeMatch[3] || 0);
  var meridiem = String(timeMatch[4] || "").toUpperCase();
  var daysInMonth =
    month >= 1 && month <= 12
      ? new Date(Date.UTC(year, month, 0)).getUTCDate()
      : 0;
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    minute > 59 ||
    second > 59
  )
    return "";
  if (meridiem) {
    if (hour < 1 || hour > 12) return "";
    if (hour === 12) hour = 0;
    if (meridiem === "PM") hour += 12;
  } else if (hour < 0 || hour > 23) return "";
  var isoLocal =
    dateMatch[1] +
    "-" +
    ("0" + month).slice(-2) +
    "-" +
    ("0" + day).slice(-2) +
    "T" +
    ("0" + hour).slice(-2) +
    ":" +
    ("0" + minute).slice(-2) +
    ":" +
    ("0" + second).slice(-2) +
    "+08:00";
  var parsed = new Date(isoLocal);
  if (!Number.isFinite(parsed.getTime())) return "";
  return parsed.toISOString();
}

function getMRHLegacySheetRows_(sheet) {
  if (!sheet || sheet.getLastRow() < 1 || sheet.getLastColumn() < 1)
    return { headers: [], rows: [] };
  var values = sheet
    .getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn())
    .getDisplayValues();
  var headers = values[0].map(function (value) {
    return String(value || "").trim();
  });
  var rows = [];
  for (var i = 1; i < values.length; i += 1) {
    if (
      values[i].every(function (value) {
        return String(value || "").trim() === "";
      })
    )
      continue;
    var object = {};
    headers.forEach(function (header, column) {
      if (header) object[header] = values[i][column];
    });
    rows.push({ rowNumber: i + 1, values: values[i], object: object });
  }
  LoggerService.recordOperation_("spreadsheet.legacy.rowsRead", rows.length);
  LoggerService.log("DEBUG", "SPREADSHEET_OPS", "Legacy source sheet rows read", {
    service: "SpreadsheetApp",
    operation: "getDisplayValues",
    sheetName: typeof sheet.getName === "function" ? sheet.getName() : "",
    startRow: 1,
    startColumn: 1,
    endRow: values.length,
    endColumn: values[0].length,
    sourceRowCount: Math.max(0, values.length - 1),
    nonEmptyDataRowCount: rows.length,
  }, "getMRHLegacySheetRows_");
  return { headers: headers, rows: rows };
}

function getMRHLegacyField_(object, names) {
  for (var i = 0; i < names.length; i += 1)
    if (Object.prototype.hasOwnProperty.call(object, names[i]))
      return object[names[i]];
  return "";
}

function getMRHLegacyLogDateTime_(object) {
  var dateText = String(getMRHLegacyField_(object, ["Date"]) || "").trim();
  var timeText = String(getMRHLegacyField_(object, ["Time"]) || "").trim();
  var timestamp = parseMRHLegacyTimestamp_(dateText, timeText);
  if (!timestamp) {
    var legacyTimestampText = String(
      getMRHLegacyField_(object, ["Timestamp", "Timesttamp"]) || "",
    ).trim();
    if (legacyTimestampText) {
      var legacyTimestamp = new Date(legacyTimestampText);
      if (Number.isFinite(legacyTimestamp.getTime())) {
        timestamp = legacyTimestamp.toISOString();
        dateText = Utilities.formatDate(
          legacyTimestamp,
          MRH_SPREADSHEET_TIME_ZONE,
          "yyyy-MM-dd",
        );
        timeText = Utilities.formatDate(
          legacyTimestamp,
          MRH_SPREADSHEET_TIME_ZONE,
          "hh:mm:ss a",
        );
      }
    }
  }
  return {
    date: cleanText(dateText, 40),
    time: cleanText(timeText, 40),
    timestamp: timestamp,
  };
}

/**
 * Idempotent legacy migration entry point. Preflight, source mapping, batched
 * writes, and post-import reconciliation are kept as explicit phases below.
 * Existing function name is retained for Apps Script menu/manual execution.
 */
function migrateMRHSpreadsheetsToSupabase() {
  var supabase = getMRHSupabaseConfig_();
  if (!supabase.enabled)
    throw new Error(
      "Configure MRH_SUPABASE_URL and MRH_SUPABASE_SECRET_KEY before migrating data.",
    );
  validateMRHSupabaseSchema_();
  var props = PropertiesService.getScriptProperties();
  var accountSourceProperty = "MRH_ACCOUNTS_SPREADSHEET_ID";
  var accountSourceId = String(
    props.getProperty(accountSourceProperty) || "",
  ).trim();
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(accountSourceId))
    throw new Error(
      "Set a valid source Google Sheets ID in " +
        accountSourceProperty +
        " before running this one-time import.",
    );
  var accountSpreadsheet = mrhLoggedSpreadsheetOpenById_(accountSourceId, "legacy account/activity source");
  var accountSheetNames = [
    MRH_ACCOUNTS_SHEET_NAME,
    MRH_LEGACY_ACCOUNTS_SHEET_NAME,
  ];
  var activitySheetNames = [
    "SIGN-IN",
    "LIBRARY",
    "SYLLABUS",
    "MODULES",
    "MODULE",
    "REVIEWERS",
  ];
  if (
    !accountSheetNames.some(function (name) {
      return Boolean(accountSpreadsheet.getSheetByName(name));
    })
  )
    throw new Error(
      "The configured source spreadsheet has neither ACCOUNTS nor Accounts. No data was imported.",
    );
  var hasValidAccountHeaderRow = false;
  accountSheetNames.forEach(function (sheetName) {
    var sheet = accountSpreadsheet.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) return;
    var accountHeaders = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getDisplayValues()[0]
      .map(function (value) {
        return String(value || "").trim();
      });
    var hasEmail =
      accountHeaders.indexOf("Email") >= 0 ||
      accountHeaders.indexOf("email") >= 0;
    var hasActive =
      accountHeaders.indexOf("Active") >= 0 ||
      accountHeaders.indexOf("active") >= 0;
    if (
      !hasEmail ||
      !hasActive ||
      accountHeaders.indexOf("Last Name") < 0 ||
      accountHeaders.indexOf("First Name") < 0
    )
      throw new Error(
        "The source account tab " +
          sheetName +
          " is missing required Email, Last Name, First Name, or Active headers. No data was imported.",
      );
    hasValidAccountHeaderRow = true;
  });
  if (!hasValidAccountHeaderRow)
    throw new Error(
      "The configured source spreadsheet has an empty or headerless ACCOUNTS/Accounts tab. No data was imported.",
    );
  if (
    accountSpreadsheet.getSheetByName("MODULES") &&
    accountSpreadsheet.getSheetByName("MODULE")
  )
    throw new Error(
      "Both MODULES and MODULE activity tabs exist. Merge them before migration.",
    );

  // Validate source activity-tab headers before writing any data.
  activitySheetNames.forEach(function (sheetName) {
    var sheet = accountSpreadsheet.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) return;
    var sourceHeaders = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getDisplayValues()[0]
      .map(function (value) {
        return String(value || "").trim();
      });
    var requiredHeaders =
      sheetName === MRH_SIGN_IN_SHEET_NAME
        ? ["Email", "Last Name", "First Name"]
        : ["Email", "Last Name", "First Name", "Event"];
    var hasTimestamp =
      sourceHeaders.indexOf("Timestamp") >= 0 ||
      sourceHeaders.indexOf("Timesttamp") >= 0;
    var hasDateAndTime =
      sourceHeaders.indexOf("Date") >= 0 && sourceHeaders.indexOf("Time") >= 0;
    var hasLegacyDeviceColumns =
      hasTimestamp &&
      sourceHeaders[1] === "Email" &&
      sourceHeaders[3] === "Last Name" &&
      sourceHeaders[4] === "First Name" &&
      sourceHeaders[5] === "Middle Initial" &&
      sourceHeaders[6] === "Event";
    if (
      requiredHeaders.some(function (header) {
        return sourceHeaders.indexOf(header) < 0;
      }) ||
      (!hasLegacyDeviceColumns && !hasDateAndTime && !hasTimestamp)
    )
      throw new Error(
        "The source activity tab " +
          sheetName +
          " has unexpected headers. Restore its header row before migration.",
      );
  });

  // Validate the central-log source before writing any account/activity rows.
  var logSourceId = String(
    props.getProperty("MRH_CENTRAL_LOG_SOURCE_SPREADSHEET_ID") ||
      props.getProperty("MRH_CENTRAL_LOG_SPREADSHEET_ID") ||
      "",
  ).trim();
  if (!logSourceId) logSourceId = MRH_CENTRAL_LOG_SPREADSHEET_ID_DEFAULT;
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(logSourceId))
    throw new Error(
      "Set MRH_CENTRAL_LOG_SOURCE_SPREADSHEET_ID or the existing MRH_CENTRAL_LOG_SPREADSHEET_ID before migrating website logs.",
    );
  var logSpreadsheet = mrhLoggedSpreadsheetOpenById_(logSourceId, "legacy central log source");
  var hasPdfTab = Boolean(logSpreadsheet.getSheetByName("PDF"));
  var hasLegacyPdfTab = Boolean(logSpreadsheet.getSheetByName("REVIEWER_PDF"));
  if (hasPdfTab && hasLegacyPdfTab)
    throw new Error(
      "Both PDF and REVIEWER_PDF log tabs exist. Merge them before migration.",
    );
  MRH_CENTRAL_LOG_TAB_NAMES.forEach(function (tabName) {
    var sourceTabName =
      tabName === "PDF" && !hasPdfTab && hasLegacyPdfTab
        ? "REVIEWER_PDF"
        : tabName;
    var sheet = logSpreadsheet.getSheetByName(sourceTabName);
    if (!sheet || sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) return;
    var sourceHeaders = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getDisplayValues()[0]
      .map(function (value) {
        return String(value || "").trim();
      });
    if (
      MRH_CENTRAL_LOG_TAB_HEADERS.some(function (header, index) {
        return sourceHeaders[index] !== header;
      })
    )
      throw new Error(
        "The source website-log tab " +
          sourceTabName +
          " has unexpected headers. Restore its canonical header row before migration.",
      );
  });
  var accountByEmail = Object.create(null);
  accountSheetNames.forEach(function (sheetName) {
    var sheet = accountSpreadsheet.getSheetByName(sheetName);
    if (!sheet) return;
    var data = getMRHLegacySheetRows_(sheet);
    data.rows.forEach(function (entry) {
      var obj = entry.object;
      var email = String(getMRHLegacyField_(obj, ["Email", "email"]) || "")
        .trim()
        .toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error(
          "Invalid email in legacy " +
            sheetName +
            " row " +
            entry.rowNumber +
            ". Correct it before migration.",
        );
      var active = normalizeMRHAccountStatus_(
        getMRHLegacyField_(obj, ["Active", "active"]),
        sheetName,
        entry.rowNumber,
      );
      var mapped = {
        email: email,
        last_name: cleanText(getMRHLegacyField_(obj, ["Last Name"]), 100),
        first_name: cleanText(getMRHLegacyField_(obj, ["First Name"]), 100),
        middle_initial: cleanText(
          getMRHLegacyField_(obj, ["Middle Initial"]),
          10,
        ),
        active: active,
        created_date: cleanText(getMRHLegacyField_(obj, ["Date"]), 40),
        created_time: cleanText(getMRHLegacyField_(obj, ["Time"]), 40),
        last_access_date: cleanText(
          getMRHLegacyField_(obj, ["Last Access Date"]),
          40,
        ),
        last_access_time: cleanText(
          getMRHLegacyField_(obj, ["Last Access Time"]),
          40,
        ),
        permanent_pdf_issuance_id: cleanText(
          String(
            getMRHLegacyField_(obj, ["Permanent PDF Issuance ID"]) || "",
          ).trim()
            ? getMRHLegacyField_(obj, ["Permanent PDF Issuance ID"])
            : getMRHLegacyField_(obj, ["Last PDF Issuance ID"]),
          40,
        ),
        legacy_metadata: {},
      };
      data.headers.forEach(function (header) {
        if (
          header &&
          header !== "Device Identity" &&
          MRH_ACCOUNTS_HEADERS.indexOf(header) < 0 &&
          MRH_OBSOLETE_ACCOUNT_HEADERS.indexOf(header) < 0
        )
          mapped.legacy_metadata[header] = obj[header];
      });
      var previous = accountByEmail[email];
      if (previous) {
        if (
          previous.active !== mapped.active ||
          previous.last_name !== mapped.last_name ||
          previous.first_name !== mapped.first_name ||
          previous.middle_initial !== mapped.middle_initial
        )
          throw new Error(
            "Duplicate legacy account rows for " +
              email +
              " conflict on status or profile. Resolve them before migration.",
          );
        if (
          previous.permanent_pdf_issuance_id &&
          mapped.permanent_pdf_issuance_id &&
          previous.permanent_pdf_issuance_id.trim() !==
            mapped.permanent_pdf_issuance_id.trim()
        )
          throw new Error(
            "Duplicate legacy account rows for " +
              email +
              " contain conflicting permanent PDF issuance references. Resolve them before migration.",
          );
        [
          "created_date",
          "created_time",
          "last_access_date",
          "last_access_time",
          "permanent_pdf_issuance_id",
        ].forEach(function (field) {
          if (!previous[field] && mapped[field])
            previous[field] = mapped[field];
        });
        Object.keys(mapped.legacy_metadata).forEach(function (field) {
          if (
            !Object.prototype.hasOwnProperty.call(
              previous.legacy_metadata,
              field,
            )
          )
            previous.legacy_metadata[field] = mapped.legacy_metadata[field];
        });
      } else accountByEmail[email] = mapped;
    });
  });
  var accounts = Object.keys(accountByEmail)
    .sort()
    .map(function (email) {
      return accountByEmail[email];
    });
  var usedIssuanceIds = Object.create(null);
  accounts.forEach(function (account) {
    var ref = String(account.permanent_pdf_issuance_id || "").trim();
    if (!ref) {
      account.permanent_pdf_issuance_id = null;
      return;
    }
    if (!/^MRH-[0-9]{4}-[0-9]{4}$/.test(ref))
      throw new Error(
        "Invalid permanent PDF issuance reference for " +
          account.email +
          ": " +
          ref +
          ". Correct the source account row before migration; the reference was not discarded.",
      );
    account.permanent_pdf_issuance_id = ref;
    if (usedIssuanceIds[ref]) {
      throw new Error(
        "Duplicate permanent PDF issuance reference " +
          ref +
          " exists in the legacy account spreadsheets. Resolve the duplicate before migration; existing references will not be changed automatically.",
      );
    }
    usedIssuanceIds[ref] = true;
  });
  var accountsProcessed = mrhSupabaseImportAccountsIfMissing_(accounts);

  var activityImported = 0;
  var importedAuditEventFingerprints = Object.create(null);
  activitySheetNames.forEach(function (sheetName) {
    var sheet = accountSpreadsheet.getSheetByName(sheetName);
    if (!sheet) return;
    var data = getMRHLegacySheetRows_(sheet);
    var rows = data.rows.map(function (entry) {
      var obj = entry.object;
      var area = sheetName === "MODULE" ? "MODULES" : sheetName;
      var event = cleanText(getMRHLegacyField_(obj, ["Event"]), 80);
      if (!event && sheetName === "SIGN-IN") event = "SIGN_IN";
      var record = {};
      data.headers.forEach(function (header) {
        if (header) record[header] = obj[header];
      });
      var legacyDateTime = getMRHLegacyLogDateTime_(obj);
      var auditIdCandidate = String(
        getMRHLegacyField_(obj, ["Audit Event ID"]) ||
          getMRHLegacyField_(obj, ["Internal Event Key"]) ||
          "",
      )
        .trim()
        .toLowerCase();
      var persistentAuditEvents = [
        "PROFILE_UPDATED",
        "APPLICATION_SUBMITTED",
        "SIGN_OUT",
        "PROTECTED_PDF_VIEW",
        "PROTECTED_PDF_DOWNLOAD_ISSUED",
        "PDF_DOWNLOAD",
        "AUTO_RESTRICTED",
      ];
      var auditId =
        area === "REVIEWERS" &&
        persistentAuditEvents.indexOf(event.toUpperCase()) >= 0 &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          auditIdCandidate,
        )
          ? auditIdCandidate
          : "";
      var auditEmail = String(getMRHLegacyField_(obj, ["Email"]) || "")
        .trim()
        .toLowerCase();
      var auditLastName = cleanText(
        getMRHLegacyField_(obj, ["Last Name"]),
        100,
      );
      var auditFirstName = cleanText(
        getMRHLegacyField_(obj, ["First Name"]),
        100,
      );
      var auditMiddleInitial = cleanText(
        getMRHLegacyField_(obj, ["Middle Initial"]),
        10,
      );
      var auditDateTime = getMRHLegacyLogDateTime_(obj);
      var auditFingerprint = JSON.stringify([
        area,
        event.toUpperCase(),
        auditEmail,
        auditLastName,
        auditFirstName,
        auditMiddleInitial,
        auditDateTime.date,
        auditDateTime.time,
        cleanText(getMRHLegacyField_(obj, ["Course Code"]), 160),
        cleanText(getMRHLegacyField_(obj, ["Course"]), 200),
        cleanText(getMRHLegacyField_(obj, ["Category"]), 40),
        cleanText(getMRHLegacyField_(obj, ["Year"]), 40),
        cleanText(getMRHLegacyField_(obj, ["Semester"]), 40),
      ]);
      if (auditId) {
        if (
          Object.prototype.hasOwnProperty.call(
            importedAuditEventFingerprints,
            auditId,
          )
        ) {
          if (importedAuditEventFingerprints[auditId] !== auditFingerprint)
            LoggerService.log("WARN", mrhLoggerCategoryForFunction_("migrateMRHSpreadsheetsToSupabase"), "[migrateMRHSpreadsheetsToSupabase] WARNING: duplicate audit ID " +
                auditId +
                " with differing details in " +
                sheetName +
                " row " +
                entry.rowNumber +
                "; preserving the record without assigning the duplicate audit_event_id.", { source: "migrated_structured_log", sourceLine: 9365 }, "migrateMRHSpreadsheetsToSupabase");
          // Preserve duplicate historical source rows, but only one database row owns the unique audit_event_id.
          auditId = "";
        } else {
          importedAuditEventFingerprints[auditId] = auditFingerprint;
        }
      }
      var activityRow = {
        area: area,
        source_event_id: null,
        audit_event_id: auditId || null,
        legacy_source: accountSourceId + ":" + sheetName,
        legacy_row: entry.rowNumber,
        legacy_date: legacyDateTime.date,
        legacy_time: legacyDateTime.time,
        email:
          String(getMRHLegacyField_(obj, ["Email"]) || "")
            .trim()
            .toLowerCase() || null,
        last_name: cleanText(getMRHLegacyField_(obj, ["Last Name"]), 100),
        first_name: cleanText(getMRHLegacyField_(obj, ["First Name"]), 100),
        middle_initial: cleanText(
          getMRHLegacyField_(obj, ["Middle Initial"]),
          10,
        ),
        event: event,
        course_code: cleanText(getMRHLegacyField_(obj, ["Course Code"]), 160),
        year: cleanText(getMRHLegacyField_(obj, ["Year"]), 40),
        semester: cleanText(getMRHLegacyField_(obj, ["Semester"]), 40),
        category: cleanText(getMRHLegacyField_(obj, ["Category"]), 40),
        course: cleanText(getMRHLegacyField_(obj, ["Course"]), 200),
        resource: cleanText(getMRHLegacyField_(obj, ["Course"]), 200),
        issuance_reference: "",
        source_file_id: "",
        record: record,
      };
      if (legacyDateTime.timestamp)
        activityRow.created_at = legacyDateTime.timestamp;
      return activityRow;
    });
    activityImported += mrhSupabaseUpsertBatch_(
      MRH_SUPABASE_ACTIVITY_TABLE,
      rows,
      "legacy_source,legacy_row",
    );
  });

  var websiteLogsImported = 0;
  MRH_CENTRAL_LOG_TAB_NAMES.forEach(function (tabName) {
    var sourceTabName =
      tabName === "PDF" && !hasPdfTab && hasLegacyPdfTab
        ? "REVIEWER_PDF"
        : tabName;
    var sheet = logSpreadsheet.getSheetByName(sourceTabName);
    if (!sheet) return;
    var data = getMRHLegacySheetRows_(sheet);
    var rows = data.rows.map(function (entry) {
      var obj = entry.object;
      var legacyDateTime = getMRHLegacyLogDateTime_(obj);
      var durationValue = getMRHLegacyField_(obj, ["Duration ms"]);
      var duration =
        durationValue === "" || !Number.isFinite(Number(durationValue))
          ? null
          : Math.floor(Number(durationValue));
      var websiteLogRow = {
        log_group: tabName,
        legacy_source: logSourceId + ":" + sourceTabName,
        legacy_row: entry.rowNumber,
        legacy_date: legacyDateTime.date,
        legacy_time: legacyDateTime.time,
        severity: cleanText(getMRHLegacyField_(obj, ["Severity"]), 30),
        event: "legacy_import",
        outcome: cleanText(getMRHLegacyField_(obj, ["Outcome"]), 40),
        method: cleanText(getMRHLegacyField_(obj, ["Method"]), 20),
        request_type: cleanText(getMRHLegacyField_(obj, ["Request Type"]), 100),
        correlation_id: cleanText(
          getMRHLegacyField_(obj, ["Correlation ID"]),
          100,
        ),
        duration_ms: duration,
        response_code: cleanText(
          getMRHLegacyField_(obj, ["Response Code"]),
          100,
        ),
        summary: cleanText(getMRHLegacyField_(obj, ["Summary"]), 12000),
        record: obj,
      };
      if (legacyDateTime.timestamp)
        websiteLogRow.logged_at = legacyDateTime.timestamp;
      return websiteLogRow;
    });
    websiteLogsImported += mrhSupabaseUpsertBatch_(
      MRH_SUPABASE_WEBSITE_LOGS_TABLE,
      rows,
      "legacy_source,legacy_row",
    );
  });
  if (
    props.getProperty(MRH_REVIEWER_ACCESS_NOTIFICATION_BASELINE_PROPERTY) !==
    "true"
  ) {
    var latestActivity = mrhSupabaseSelect_(
      MRH_SUPABASE_ACTIVITY_TABLE,
      "select=id&order=id.desc&limit=1",
    );
    props.setProperty(
      MRH_REVIEWER_ACCESS_NOTIFICATION_CURSOR_PROPERTY,
      String(latestActivity.length ? Number(latestActivity[0].id) || 0 : 0),
    );
    props.setProperty(
      MRH_REVIEWER_ACCESS_NOTIFICATION_BASELINE_PROPERTY,
      "true",
    );
  }
  invalidateMRHAccountCacheAll_();
  return {
    status: "success",
    storage: "supabase",
    accountsProcessed: accountsProcessed,
    activityLogsProcessed: activityImported,
    websiteLogsProcessed: websiteLogsImported,
    note: "Source spreadsheets were not modified or deleted. Account rows already present in Supabase are preserved; migrated log rows are keyed by their legacy source and row number for repeatable imports.",
  };
}

function doGet(e) {
  return executeLoggedWebAppRequest_("GET", e || {}, function (event) {
    return handleGetRequest_(event);
  });
}

function handleGetRequest_(e) {
  var startedAt = Date.now();
  try {
    return doGetInternal(e || { parameter: {} });
  } catch (error) {
    var correlationId = createBackendCorrelationId_();
    logBackendFailure_(
      "doGet",
      "get",
      correlationId,
      error,
      Date.now() - startedAt,
      e && e.parameter && (e.parameter.v || e.parameter.appVersion),
      e && e.parameter,
      e && e.__mrhCentralLogState,
    );
    return errorResponse(
      "Server error. Reference: " + correlationId + ".",
      "SERVER_ERROR",
      {
        correlationId: correlationId,
      },
    );
  }
}

function doGetInternal(e) {
  var params = e && e.parameter ? e.parameter : {};
  if (!Object.keys(params).length) return handleSyncStatus();
  var versionError = clientVersionRequired(params.v || params.appVersion);
  if (versionError) return versionError;
  if (String(params.sync || "") === "1") {
    var knownTimestamp = String(params.since || "");
    var knownCacheVersion = String(params.sinceCacheVersion || "");
    if (
      knownTimestamp.length > 100 ||
      knownCacheVersion.length > 200 ||
      /[\u0000-\u001f\u007f]/.test(knownTimestamp) ||
      /[\u0000-\u001f\u007f]/.test(knownCacheVersion)
    )
      return errorResponse("Invalid sync query parameters.", "BAD_REQUEST");
    return handleDeckSyncSnapshot_(knownTimestamp, knownCacheVersion);
  }

  var rawSubject = String(params.subject || "");
  if (rawSubject.length > 500 || /[\u0000-\u001f\u007f]/.test(rawSubject))
    return errorResponse("Invalid deck subject.", "BAD_REQUEST");
  var requestedSubject = normalizeSubject(rawSubject);

  if (requestedSubject) {
    var metadataMap = loadDeckMetadataMap();
    var metadata = metadataMap[requestedSubject];
    var effectivePassword = getEffectivePassword(requestedSubject, metadataMap);

    if (effectivePassword) {
      return errorResponse(
        "Password-protected decks require a POST request.",
        "PASSWORD_REQUIRED",
      );
    }
    if (isSubjectHiddenByHierarchy(requestedSubject, metadataMap))
      return errorResponse("This deck is not available.", "FORBIDDEN");
    if (!metadata)
      return errorResponse("This deck was not found.", "NOT_FOUND");
    if (params.page !== undefined || params.limit !== undefined) {
      return handleGetDeckRequest({
        subject: requestedSubject,
        page: params.page,
        limit: params.limit,
      });
    }

    var publicKey = buildDeckCacheKey(requestedSubject, "authorized");
    var publicCached = cacheGetChunked(publicKey);
    if (publicCached !== null)
      return ContentService.createTextOutput(publicCached).setMimeType(
        ContentService.MimeType.JSON,
      );

    var publicContent = getDeckJsonContent(requestedSubject);
    if (publicContent === null)
      return errorResponse("Deck data is not available yet.", "NOT_READY");

    cachePutChunked(publicKey, publicContent);
    return ContentService.createTextOutput(publicContent).setMimeType(
      ContentService.MimeType.JSON,
    );
  }

  var props = getScriptProps();
  if (
    props.getProperty("MRH_SUBJECT_SCHEMA_VERSION") !== SUBJECT_SCHEMA_VERSION
  ) {
    props.setProperty("FORCE_REBUILD", "true");
    try {
      ensureResumeBuildTrigger();
    } catch (triggerError) {
      LoggerService.log("ERROR", "TRIGGER", "Schema rebuild trigger creation failed", {}, "doGet", triggerError);
    }
    return jsonResponse({ isColdStart: true, subjects: [] });
  }

  var summaryKey = generateCacheKey("summary");
  var cachedSummary = cacheGetChunked(summaryKey);
  if (cachedSummary !== null) {
    var filteredCachedSummary = filterSummaryDataByAccess(cachedSummary);
    if (filteredCachedSummary !== null) {
      return ContentService.createTextOutput(filteredCachedSummary).setMimeType(
        ContentService.MimeType.JSON,
      );
    }
  }

  var cacheFolder = getOrCreateCacheFolder();
  var summaryFiles = findCacheFilesByName(cacheFolder, "MRH_Summary.json");
  if (summaryFiles.hasNext()) {
    var summaryContent = summaryFiles.next().getBlob().getDataAsString();
    var filtered = filterSummaryDataByAccess(summaryContent);
    if (filtered !== null) {
      cachePutChunked(summaryKey, summaryContent);
      return ContentService.createTextOutput(filtered).setMimeType(
        ContentService.MimeType.JSON,
      );
    }
  }

  props.setProperty("FORCE_REBUILD", "true");
  try {
    ensureResumeBuildTrigger();
  } catch (triggerError) {
    LoggerService.log("ERROR", "TRIGGER", "Cache rebuild trigger creation failed", {}, "doGet", triggerError);
  }
  return jsonResponse({ isColdStart: true, subjects: [] });
}

function createDeckSyncPendingResponse_(props, buildStatus) {
  return jsonResponse({
    status: "ok",
    payloadSchemaVersion: BACKEND_PAYLOAD_SCHEMA_VERSION,
    syncTimestamp:
      props.getProperty("MRH_CACHE_VERSION_TIMESTAMP") ||
      props.getProperty("LAST_CACHE_UPDATE") ||
      "",
    cacheVersion: getCacheInvalidationVersion(),
    hasSummary: Boolean(props.getProperty("LAST_CACHE_BUILD_SUCCESS")),
    isColdStart: !props.getProperty("LAST_CACHE_BUILD_SUCCESS"),
    syncPending: true,
    retryAfterMs: 5000,
    buildStatus: buildStatus || props.getProperty("BUILD_STATUS") || "IDLE",
  });
}

function isAccessFilteredSummaryDictionary_(summary) {
  return Boolean(
    summary &&
    summary.v === 1 &&
    Array.isArray(summary.p) &&
    Array.isArray(summary.d) &&
    Array.isArray(summary.h) &&
    decodeSummaryDictionary(summary) !== null,
  );
}

function handleDeckSyncSnapshot_(knownTimestamp, knownCacheVersion) {
  var props = getScriptProps();
  var schemaMismatch =
    props.getProperty("MRH_SUBJECT_SCHEMA_VERSION") !== SUBJECT_SCHEMA_VERSION;
  var hasSummary = Boolean(props.getProperty("LAST_CACHE_BUILD_SUCCESS"));
  var buildStatus = props.getProperty("BUILD_STATUS") || "IDLE";
  var currentMetadataVersion = String(
    props.getProperty("MRH_DECK_METADATA_VERSION") || "0",
  );
  var summaryMetadataVersionMatches =
    currentMetadataVersion ===
    String(props.getProperty("MRH_CACHE_METADATA_VERSION") || "");
  var timestamp =
    props.getProperty("MRH_CACHE_VERSION_TIMESTAMP") ||
    props.getProperty("LAST_CACHE_UPDATE") ||
    "";
  var cacheVersion = getCacheInvalidationVersion();

  if (buildStatus === "RUNNING") {
    return createDeckSyncPendingResponse_(props, buildStatus);
  }

  if (schemaMismatch || !hasSummary) {
    try {
      if (schemaMismatch) props.setProperty("FORCE_REBUILD", "true");
      ensureResumeBuildTrigger();
    } catch (triggerError) {
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("handleDeckSyncSnapshot_"), "[handleDeckSyncSnapshot_] rebuild trigger failed: " + triggerError, { source: "migrated_structured_log", sourceLine: 9694 }, "handleDeckSyncSnapshot_");
    }
    return jsonResponse({
      status: "ok",
      payloadSchemaVersion: BACKEND_PAYLOAD_SCHEMA_VERSION,
      syncTimestamp: timestamp,
      cacheVersion: cacheVersion,
      hasSummary: hasSummary,
      isColdStart: true,
      buildStatus: buildStatus,
    });
  }

  if (
    knownTimestamp &&
    knownTimestamp === timestamp &&
    knownCacheVersion &&
    knownCacheVersion === cacheVersion
  ) {
    var latestConditionalTimestamp =
      props.getProperty("MRH_CACHE_VERSION_TIMESTAMP") ||
      props.getProperty("LAST_CACHE_UPDATE") ||
      "";
    var latestConditionalCacheVersion = getCacheInvalidationVersion();
    var latestConditionalBuildStatus =
      props.getProperty("BUILD_STATUS") || "IDLE";
    if (
      latestConditionalTimestamp !== timestamp ||
      latestConditionalCacheVersion !== cacheVersion ||
      latestConditionalBuildStatus !== buildStatus
    ) {
      return createDeckSyncPendingResponse_(
        props,
        latestConditionalBuildStatus,
      );
    }
    return jsonResponse({
      status: "ok",
      notModified: true,
      payloadSchemaVersion: BACKEND_PAYLOAD_SCHEMA_VERSION,
      syncTimestamp: timestamp,
      cacheVersion: cacheVersion,
      hasSummary: true,
      isColdStart: false,
      buildStatus: buildStatus,
    });
  }

  var summaryKey = generateCacheKey("summary");
  var summaryContent = null;
  var filteredSummary = null;
  var filteredSummaryWasCached = false;
  if (buildStatus === "IDLE") {
    var cachedFilteredSummary = cacheGetChunked(
      getDeckSyncSummaryCacheKey_(
        cacheVersion,
        props.getProperty("MRH_DECK_METADATA_VERSION"),
      ),
    );
    if (cachedFilteredSummary !== null) {
      try {
        var parsedFilteredSummary = JSON.parse(cachedFilteredSummary);
        if (isAccessFilteredSummaryDictionary_(parsedFilteredSummary)) {
          filteredSummary = parsedFilteredSummary;
          filteredSummaryWasCached = true;
        }
      } catch (cacheError) {
        LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("handleDeckSyncSnapshot_"), "[handleDeckSyncSnapshot_] filtered summary cache is invalid.", { source: "migrated_structured_log", sourceLine: 9763 }, "handleDeckSyncSnapshot_");
      }
    }
  }
  if (filteredSummary === null) {
    summaryContent = cacheGetChunked(summaryKey);
    if (summaryContent !== null) {
      try {
        var parsedCachedSummary = JSON.parse(summaryContent);
        filteredSummary =
          summaryMetadataVersionMatches &&
          isAccessFilteredSummaryDictionary_(parsedCachedSummary)
            ? parsedCachedSummary
            : filterSummaryDictionaryByAccess_(summaryContent);
      } catch (cacheError) {
        filteredSummary = filterSummaryDictionaryByAccess_(summaryContent);
      }
    }
  }
  if (filteredSummary === null) {
    var cacheFolder = getOrCreateCacheFolder();
    var summaryFiles = findCacheFilesByName(cacheFolder, "MRH_Summary.json");
    if (summaryFiles.hasNext()) {
      summaryContent = summaryFiles.next().getBlob().getDataAsString();
      try {
        var parsedStoredSummary = JSON.parse(summaryContent);
        filteredSummary =
          summaryMetadataVersionMatches &&
          isAccessFilteredSummaryDictionary_(parsedStoredSummary)
            ? parsedStoredSummary
            : filterSummaryDictionaryByAccess_(summaryContent);
      } catch (summaryError) {
        filteredSummary = filterSummaryDictionaryByAccess_(summaryContent);
      }
      if (filteredSummary !== null) cachePutChunked(summaryKey, summaryContent);
    }
  }
  if (filteredSummary === null) {
    return jsonResponse({
      status: "ok",
      payloadSchemaVersion: BACKEND_PAYLOAD_SCHEMA_VERSION,
      syncTimestamp: timestamp,
      cacheVersion: cacheVersion,
      hasSummary: false,
      isColdStart: true,
      buildStatus: buildStatus,
    });
  }
  var latestTimestamp =
    props.getProperty("MRH_CACHE_VERSION_TIMESTAMP") ||
    props.getProperty("LAST_CACHE_UPDATE") ||
    "";
  var latestCacheVersion = getCacheInvalidationVersion();
  var latestBuildStatus = props.getProperty("BUILD_STATUS") || "IDLE";
  if (
    latestTimestamp !== timestamp ||
    latestCacheVersion !== cacheVersion ||
    latestBuildStatus !== buildStatus
  ) {
    return createDeckSyncPendingResponse_(props, latestBuildStatus);
  }
  if (buildStatus === "IDLE" && !filteredSummaryWasCached)
    cachePutChunked(
      getDeckSyncSummaryCacheKey_(
        cacheVersion,
        props.getProperty("MRH_DECK_METADATA_VERSION"),
      ),
      JSON.stringify(filteredSummary),
    );

  return jsonResponse({
    status: "ok",
    payloadSchemaVersion: BACKEND_PAYLOAD_SCHEMA_VERSION,
    syncTimestamp: timestamp,
    cacheVersion: cacheVersion,
    hasSummary: true,
    isColdStart: false,
    buildStatus: buildStatus,
    summary: filteredSummary,
  });
}

function filterSummaryDictionaryByAccess_(summaryJsonString) {
  var data;
  try {
    data = JSON.parse(summaryJsonString);
  } catch (e) {
    return null;
  }
  var entries = decodeSummaryDictionary(data);
  if (!entries) return null;

  var metadata = loadDeckMetadataMap();
  var output = [];
  var seen = Object.create(null);

  for (var i = 0; i < entries.length; i++) {
    var item = entries[i];
    if (!item) continue;
    var rawSubject = item.s !== undefined ? item.s : item.Subject;
    if (!rawSubject) continue;

    var subject = normalizeSubject(rawSubject);
    if (!subject || seen[subject]) continue;

    var record = metadata[subject];
    if (!record) continue;
    if (isSubjectHiddenByHierarchy(subject, metadata)) continue;

    var questionType =
      item.t !== undefined ? item.t : item.QuestionType || "ID";
    seen[subject] = true;
    var compactEntry = {
      s: subject,
      c: Number(item.c !== undefined ? item.c : item.QuestionCount || 0),
      t: questionType,
      h: String(item.h || ""),
      e:
        item.e === "t" || item.e === true || item.HasExplanations === true
          ? "t"
          : "f",
    };
    if (getEffectivePassword(subject, metadata)) compactEntry.l = "t";
    output.push(compactEntry);
  }

  output.sort(function (a, b) {
    return compareSubjectHierarchy(a.s, b.s);
  });
  return encodeSummaryDictionary(output);
}

function filterSummaryDataByAccess(summaryJsonString) {
  var filtered = filterSummaryDictionaryByAccess_(summaryJsonString);
  return filtered === null ? null : JSON.stringify(filtered);
}

/* -------------------------------------------------------------------------- */
/* POST / API handlers                                                        */
/* -------------------------------------------------------------------------- */

var MAX_BACKEND_POST_BYTES = 500000;
var BACKEND_POST_REQUEST_SCHEMAS = {
  get_reviewer_auth_config: {
    required: [],
    allowed: ["type", "appVersion", "requestId"],
  },
  verify_reviewer_access: {
    required: ["idToken", "eventId", "sessionPublicKey"],
    allowed: [
      "type",
      "idToken",
      "eventId",
      "sessionPublicKey",
      "appVersion",
      "requestId",
    ],
  },
  log_reviewer_sign_in: {
    required: ["sessionId", "eventId"],
    allowed: [
      "type",
      "sessionId",
      "sessionProof",
      "eventId",
      "appVersion",
      "requestId",
    ],
  },
  restore_reviewer_session: {
    required: ["sessionId"],
    allowed: ["type", "sessionId", "sessionProof", "appVersion", "requestId"],
  },
  sign_out_reviewer: {
    required: ["sessionId", "eventId"],
    allowed: [
      "type",
      "sessionId",
      "sessionProof",
      "eventId",
      "appVersion",
      "requestId",
    ],
  },
  get_reviewer_account_status: {
    required: [],
    allowed: [
      "type",
      "idToken",
      "sessionId",
      "sessionProof",
      "appVersion",
      "requestId",
    ],
  },
  request_reviewer_enrollment: {
    required: ["eventId"],
    allowed: [
      "type",
      "idToken",
      "sessionId",
      "sessionProof",
      "eventId",
      "lastName",
      "firstName",
      "middleInitial",
      "appVersion",
      "requestId",
    ],
  },
  get_reviewer_dashboard: {
    required: ["eventId"],
    allowed: [
      "type",
      "idToken",
      "sessionId",
      "sessionProof",
      "eventId",
      "appVersion",
      "requestId",
    ],
  },
  get_reviewer_pdf_preview: {
    required: ["sessionId", "eventId", "fileId"],
    allowed: [
      "type",
      "sessionId",
      "sessionProof",
      "eventId",
      "fileId",
      "course",
      "courseName",
      "year",
      "semester",
      "category",
      "cachedSourceVersion",
      "preferDeliveryMode",
      "issuancePurpose",
      "appVersion",
      "requestId",
    ],
  },
  log_module_access: {
    required: ["eventId"],
    allowed: [
      "type",
      "idToken",
      "sessionId",
      "sessionProof",
      "eventId",
      "appVersion",
      "requestId",
    ],
  },
  log_resource_file_click: {
    required: ["eventId", "resourceArea", "fileName", "fileId"],
    allowed: [
      "type",
      "eventId",
      "resourceArea",
      "fileName",
      "fileId",
      "course",
      "year",
      "semester",
      "category",
      "idToken",
      "sessionId",
      "sessionProof",
      "appVersion",
      "requestId",
    ],
  },
  log_resource_dashboard_action: {
    required: ["eventId", "resourceArea", "action"],
    allowed: [
      "type",
      "eventId",
      "resourceArea",
      "action",
      "detail",
      "resource",
      "course",
      "year",
      "semester",
      "category",
      "fileId",
      "issuanceReference",
      "idToken",
      "sessionId",
      "sessionProof",
      "appVersion",
      "requestId",
    ],
  },
  batch_log_resource_events: {
    required: [],
    allowed: ["type", "events", "appVersion", "requestId"],
  },
  get_deck: {
    required: ["subject"],
    allowed: [
      "type",
      "subject",
      "password",
      "page",
      "limit",
      "appVersion",
      "requestId",
    ],
  },
  verify_folder_access: {
    required: ["subject", "password"],
    allowed: ["type", "subject", "password", "appVersion", "requestId"],
  },
  verify_access: {
    required: ["subject", "password"],
    allowed: ["type", "subject", "password", "appVersion", "requestId"],
  },
  get_cache_version: {
    required: [],
    allowed: ["type", "appVersion", "requestId"],
  },
  get_sync_status: {
    required: [],
    allowed: ["type", "appVersion", "requestId"],
  },
  list_public_resources: {
    required: [],
    allowed: ["type", "folderId", "pageToken", "appVersion", "requestId"],
  },
  get_resource_preview: {
    required: ["fileId"],
    allowed: ["type", "fileId", "previewMode", "appVersion", "requestId"],
  },
  get_resource_dashboard: {
    required: ["eventId"],
    allowed: [
      "type",
      "version",
      "idToken",
      "sessionId",
      "sessionProof",
      "eventId",
      "appVersion",
      "requestId",
    ],
  },
};
var BACKEND_POST_STRING_LIMITS = {
  type: 64,
  idToken: 8192,
  sessionId: 96,
  sessionProof: 512,
  sessionPublicKey: 1024,
  eventId: 36,
  requestId: 36,
  appVersion: 128,
  lastName: 100,
  firstName: 100,
  middleInitial: 10,
  fileId: 200,
  cachedSourceVersion: 64,
  preferDeliveryMode: 16,
  issuancePurpose: 16,
  issuanceReference: 16,
  resourceArea: 32,
  fileName: 200,
  course: 160,
  courseName: 160,
  year: 40,
  semester: 40,
  category: 40,
  action: 64,
  detail: 200,
  resource: 200,
  subject: 500,
  password: 500,
  folderId: 200,
  pageToken: 2048,
  previewMode: 16,
  version: 2048,
};

function utf8ByteLength_(value) {
  var byteLength = 0;
  for (var i = 0; i < value.length; i++) {
    var code = value.charCodeAt(i);
    if (code <= 0x7f) byteLength += 1;
    else if (code <= 0x7ff) byteLength += 2;
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      i + 1 < value.length &&
      value.charCodeAt(i + 1) >= 0xdc00 &&
      value.charCodeAt(i + 1) <= 0xdfff
    ) {
      byteLength += 4;
      i += 1;
    } else byteLength += 3;
    if (byteLength > MAX_BACKEND_POST_BYTES) return byteLength;
  }
  return byteLength;
}

function validateBackendPostRequest_(data) {
  var requestType = typeof data.type === "string" ? data.type.trim() : "";
  if (requestType !== data.type)
    return errorResponse("Invalid request type.", "BAD_REQUEST");
  var schema = Object.prototype.hasOwnProperty.call(
    BACKEND_POST_REQUEST_SCHEMAS,
    requestType,
  )
    ? BACKEND_POST_REQUEST_SCHEMAS[requestType]
    : null;
  if (!schema) return errorResponse("Unknown request type.", "UNKNOWN_REQUEST");

  var allowed = Object.create(null);
  schema.allowed.forEach(function (key) {
    allowed[key] = true;
  });
  if (
    requestType === "batch_log_resource_events" &&
    (!Array.isArray(data.events) ||
      data.events.length < 1 ||
      data.events.length > 10)
  )
    return errorResponse(
      "The request must contain between 1 and 10 resource events.",
      "BAD_REQUEST",
    );
  var keys = Object.keys(data);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (!allowed[key]) {
      return errorResponse(
        "The request contains an unsupported field.",
        "BAD_REQUEST",
      );
    }
    var value = data[key];
    if (value === null || value === undefined) continue;
    if (key === "events" && requestType === "batch_log_resource_events")
      continue;
    if (key === "page" || key === "limit") {
      var paginationValue =
        typeof value === "number" || typeof value === "string"
          ? Number(value)
          : NaN;
      if (
        !Number.isInteger(paginationValue) ||
        paginationValue < 1 ||
        (key === "limit" && paginationValue > 1000)
      ) {
        return errorResponse(
          "The request contains an invalid pagination value.",
          "BAD_REQUEST",
        );
      }
      data[key] = paginationValue;
      continue;
    }
    var maxLength = BACKEND_POST_STRING_LIMITS[key];
    if (
      typeof value !== "string" ||
      !Number.isFinite(maxLength) ||
      value.length > maxLength
    ) {
      return errorResponse(
        "The request contains an invalid field value.",
        "BAD_REQUEST",
      );
    }
  }
  if (requestType === "batch_log_resource_events") {
    for (var eventIndex = 0; eventIndex < data.events.length; eventIndex++) {
      var resourceEvent = data.events[eventIndex];
      if (
        !resourceEvent ||
        typeof resourceEvent !== "object" ||
        Array.isArray(resourceEvent) ||
        ["log_resource_dashboard_action", "log_resource_file_click"].indexOf(
          resourceEvent.type,
        ) < 0
      )
        return errorResponse(
          "The request contains an unsupported resource event.",
          "BAD_REQUEST",
        );
      var eventValidationError = validateBackendPostRequest_(resourceEvent);
      if (eventValidationError) return eventValidationError;
      if (
        resourceEvent.type === "log_resource_dashboard_action" &&
        resourceEvent.action === "PDF_DOWNLOAD"
      )
        return errorResponse(
          "Protected PDF download audits must use the immediate logging route.",
          "BAD_REQUEST",
        );
    }
  }

  for (
    var requiredIndex = 0;
    requiredIndex < schema.required.length;
    requiredIndex++
  ) {
    var requiredKey = schema.required[requiredIndex];
    if (typeof data[requiredKey] !== "string" || !data[requiredKey].trim()) {
      return errorResponse(
        "A required request field is missing.",
        "BAD_REQUEST",
      );
    }
  }
  var uuidFields = ["eventId", "requestId"];
  for (var uuidIndex = 0; uuidIndex < uuidFields.length; uuidIndex++) {
    var key = uuidFields[uuidIndex];
    if (
      data[key] !== undefined &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        data[key],
      )
    ) {
      return errorResponse(
        "The request contains an invalid event identifier.",
        "BAD_REQUEST",
      );
    }
  }
  return null;
}

function doPost(e) {
  return executeLoggedWebAppRequest_("POST", e || {}, function (event) {
    return doPostInternal_(event);
  });
}

function doPostInternal_(e) {
  var requestType = "unknown";
  var correlationId = createBackendCorrelationId_();
  var startedAt = Date.now();
  var clientVersion = "";
  try {
    if (!e || !e.postData || !e.postData.contents)
      return errorResponse("Request body is required.", "BAD_REQUEST");
    if (typeof e.postData.contents !== "string")
      return errorResponse("Invalid request body.", "BAD_REQUEST");
    if (
      e.postData.contents.length > MAX_BACKEND_POST_BYTES ||
      utf8ByteLength_(e.postData.contents) > MAX_BACKEND_POST_BYTES
    )
      return errorResponse(
        "Request body exceeds the maximum size.",
        "PAYLOAD_TOO_LARGE",
      );

    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseError) {
      return errorResponse("Invalid JSON request body.", "BAD_JSON");
    }

    if (!data || typeof data !== "object" || Array.isArray(data))
      return errorResponse("Invalid request body.", "BAD_REQUEST");

    requestType = String(data.type || "unknown");
    var versionError = clientVersionRequired(data.appVersion);
    if (versionError) return versionError;
    clientVersion = String(data.appVersion || "");
    var requestValidationError = validateBackendPostRequest_(data);
    if (requestValidationError) return requestValidationError;

    if (
      [
        "verify_reviewer_access",
        "log_reviewer_sign_in",
        "request_reviewer_enrollment",
        "get_reviewer_dashboard",
        "get_reviewer_pdf_preview",
        "log_module_access",
        "log_resource_file_click",
        "log_resource_dashboard_action",
        "get_resource_dashboard",
      ].indexOf(requestType) !== -1 &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(data.eventId || ""),
      )
    )
      return errorResponse(
        "A valid event ID is required for this request.",
        "BAD_REQUEST",
      );
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(data.requestId || ""),
      )
    )
      correlationId = String(data.requestId).toLowerCase();
    else if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        String(data.eventId || ""),
      )
    )
      correlationId = String(data.eventId).toLowerCase();
    if (requestType === "get_reviewer_auth_config")
      return handleGetReviewerAuthorizationConfigRequest();
    if (requestType === "verify_reviewer_access")
      return handleReviewerSignInRequest(data, startedAt, correlationId);
    if (requestType === "log_reviewer_sign_in")
      return handleLogReviewerSignInRequest(data);
    if (requestType === "restore_reviewer_session")
      return handleRestoreReviewerSessionRequest(data);
    if (requestType === "sign_out_reviewer")
      return handleRevokeReviewerSessionRequest(data);
    if (requestType === "get_reviewer_account_status")
      return handleGetReviewerAccountStatusRequest(data);
    if (requestType === "request_reviewer_enrollment")
      return handleReviewerEnrollmentRequest(data, startedAt, correlationId);
    if (requestType === "get_reviewer_dashboard")
      return handleGetReviewerDashboardRequest(data);
    if (requestType === "get_reviewer_pdf_preview")
      return handleGetReviewerPdfPreviewRequest_(data);
    if (requestType === "log_module_access")
      return handleLogModuleAccessRequest(data);
    if (requestType === "log_resource_file_click")
      return handleLogResourceFileClickRequest(data);
    if (requestType === "log_resource_dashboard_action")
      return handleLogResourceDashboardActionRequest(data);
    if (requestType === "batch_log_resource_events")
      return handleBatchLogResourceEventsRequest(data);
    if (requestType === "get_resource_dashboard")
      return handleGetResourceDashboardRequest(data.version);
    if (requestType === "list_public_resources")
      return handleListPublicResourcesRequest(data);
    if (requestType === "get_resource_preview")
      return handleGetResourcePreviewRequest(data);
    if (requestType === "get_deck") return handleGetDeckRequest(data);
    if (
      requestType === "verify_folder_access" ||
      requestType === "verify_access"
    )
      return handleVerifyAccessRequest(data);
    if (requestType === "get_cache_version") {
      return jsonResponse({
        version: getCacheInvalidationVersion(),
        timestamp: getLastModificationTimestamp(),
      });
    }
    if (requestType === "get_sync_status") return handleSyncStatus();

    return errorResponse("Unknown request type.", "UNKNOWN_REQUEST");
  } catch (error) {
    logBackendFailure_(
      "doPost",
      requestType,
      correlationId,
      error,
      Date.now() - startedAt,
      clientVersion,
      e && e.postData && e.postData.contents,
      e && e.__mrhCentralLogState,
    );
    var temporaryUnavailable = error && error.code === "TEMPORARY_UNAVAILABLE";
    return errorResponse(
      temporaryUnavailable
        ? String(
            error.message ||
              "The service is temporarily busy. Please try again.",
          )
        : "Server error. Reference: " + correlationId + ".",
      temporaryUnavailable ? "TEMPORARY_UNAVAILABLE" : "SERVER_ERROR",
      {
        correlationId: correlationId,
      },
    );
  }
}

function handleSyncStatus() {
  var props = getScriptProps();
  var lastCacheUpdate =
    props.getProperty("MRH_CACHE_VERSION_TIMESTAMP") ||
    props.getProperty("LAST_CACHE_UPDATE") ||
    "";
  var hasSummary = Boolean(props.getProperty("LAST_CACHE_BUILD_SUCCESS"));
  var buildStatus = props.getProperty("BUILD_STATUS") || "IDLE";
  var schemaMismatch =
    props.getProperty("MRH_SUBJECT_SCHEMA_VERSION") !== SUBJECT_SCHEMA_VERSION;

  if (schemaMismatch) {
    props.setProperty("FORCE_REBUILD", "true");
    try {
      ensureResumeBuildTrigger();
    } catch (triggerError) {
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("handleSyncStatus"), "[handleSyncStatus] schema rebuild trigger failed: " + triggerError, { source: "migrated_structured_log", sourceLine: 10460 }, "handleSyncStatus");
    }
  }

  return jsonResponse({
    status: "ok",
    payloadSchemaVersion: BACKEND_PAYLOAD_SCHEMA_VERSION,
    syncTimestamp: lastCacheUpdate,
    cacheVersion: getCacheInvalidationVersion(),
    hasSummary: hasSummary,
    isColdStart: !hasSummary || schemaMismatch,
    serverTime: new Date().toISOString(),
    subjectSchemaVersion: SUBJECT_SCHEMA_VERSION,
    driveAuthoritative: true,
    buildStatus: buildStatus,
  });
}

/* -------------------------------------------------------------------------- */
/* Builder / resumable queue                                                  */
/* -------------------------------------------------------------------------- */

function onEdit(e) {
  // Intentionally no-op for business logic; UUID edits are handled by uuidSheetEdited.
  // Log only event identity and range metadata; never log cell values.
  var eventMetadata = { hasEvent: !!e, hasSource: !!(e && e.source), hasRange: !!(e && e.range) };
  try {
    if (e && e.source && typeof e.source.getId === "function")
      eventMetadata.sourceSpreadsheetId = mrhLoggerSafeIdentifier_(e.source.getId());
    if (e && e.range) {
      eventMetadata.rangeA1 = typeof e.range.getA1Notation === "function" ? e.range.getA1Notation() : "";
      eventMetadata.startRow = typeof e.range.getRow === "function" ? e.range.getRow() : null;
      eventMetadata.startColumn = typeof e.range.getColumn === "function" ? e.range.getColumn() : null;
      eventMetadata.numRows = typeof e.range.getNumRows === "function" ? e.range.getNumRows() : null;
      eventMetadata.numColumns = typeof e.range.getNumColumns === "function" ? e.range.getNumColumns() : null;
      var eventSheet = typeof e.range.getSheet === "function" ? e.range.getSheet() : null;
      eventMetadata.sheetName = eventSheet && typeof eventSheet.getName === "function" ? eventSheet.getName() : "";
    }
    if (e && e.changeType) eventMetadata.changeType = String(e.changeType);
    if (e && e.triggerUid) eventMetadata.triggerUid = String(e.triggerUid);
  } catch (eventError) {
    eventMetadata.eventDetailsUnavailable = true;
  }
  LoggerService.log("INFO", "TRIGGER", "Simple onEdit trigger received", eventMetadata, "onEdit");
}

/**
 * Return edit details only for changes inside the configured UUID spreadsheet's
 * UUID tab and the seven metadata columns. Edits to other tabs or unrelated
 * columns must not trigger a database rebuild.
 */
function getUUIDSheetEditContext_(e) {
  try {
    if (!e || !e.source || !e.range) return null;
    if (String(e.source.getId()) !== getMRHUuidSpreadsheetId_()) return null;

    var range = e.range;
    var sheet = range.getSheet();
    var editMetadata = {
      sourceSpreadsheetId: mrhLoggerSafeIdentifier_(e.source.getId()),
      sheetName: sheet && typeof sheet.getName === "function" ? sheet.getName() : "",
      rangeA1: typeof range.getA1Notation === "function" ? range.getA1Notation() : "",
      startRow: range.getRow(), startColumn: range.getColumn(),
      numRows: typeof range.getNumRows === "function" ? range.getNumRows() : null,
      numColumns: typeof range.getNumColumns === "function" ? range.getNumColumns() : null,
      triggerUid: e.triggerUid ? String(e.triggerUid) : "",
    };
    LoggerService.log("INFO", "TRIGGER", "Installable spreadsheet edit event received", editMetadata, "getUUIDSheetEditContext_");
    if (!sheet || sheet.getName() !== "UUID") return null;

    var firstColumn = range.getColumn();
    var lastColumn = range.getLastColumn();
    if (lastColumn < 1 || firstColumn > UUID_SHEET_COLUMN_COUNT) return null;

    return {
      range: range,
      firstRow: range.getRow(),
      firstColumn: firstColumn,
      lastColumn: lastColumn,
      metadataOnly:
        range.getRow() >= 2 && firstColumn >= 3 && lastColumn <= 4,
    };
  } catch (error) {
    LoggerService.log("ERROR", "TRIGGER", "Unable to inspect UUID spreadsheet edit event", {
      hasEvent: !!e,
    }, "getUUIDSheetEditContext_", error);
    return null;
  }
}

/**
 * Refresh the access-filtered sync summary without re-extracting question data.
 * This is safe only when every currently visible source deck is represented in
 * the stored summary. If an edit unhides a deck omitted from that summary, return
 * false so the caller performs a full rebuild and restores the missing entry.
 */
function refreshDeckSyncAfterMetadataEdit_() {
  var props = getScriptProps();
  if (!props.getProperty("LAST_CACHE_BUILD_SUCCESS")) return false;
  if ((props.getProperty("BUILD_STATUS") || "IDLE") === "RUNNING") return false;

  try {
    var cacheFolder = getOrCreateCacheFolder(true);
    var summaryFiles = findCacheFilesByName(cacheFolder, "MRH_Summary.json");
    if (!summaryFiles.hasNext()) return false;

    var summaryContent = summaryFiles.next().getBlob().getDataAsString();
    var parsedSummary = JSON.parse(summaryContent);
    var summaryEntries = decodeSummaryDictionary(parsedSummary);
    if (!summaryEntries) return false;

    var summarizedSubjects = Object.create(null);
    for (var i = 0; i < summaryEntries.length; i++) {
      var entry = summaryEntries[i] || {};
      var rawSubject = entry.s !== undefined ? entry.s : entry.Subject;
      var subject = normalizeSubject(rawSubject);
      if (subject) summarizedSubjects[subject] = true;
    }

    var metadata = loadDeckMetadataMap(true);
    for (var subjectKey in metadata) {
      if (!Object.prototype.hasOwnProperty.call(metadata, subjectKey)) continue;
      var record = metadata[subjectKey] || {};
      var sourceType = String(record.sourceType || "").trim().toLowerCase();
      if (sourceType === "container" || sourceType === "folder") continue;
      if (isSubjectHiddenByHierarchy(subjectKey, metadata)) continue;
      if (!summarizedSubjects[subjectKey]) {
        // Most importantly, an unhidden deck may be absent from the old summary.
        // Rebuilding is required to safely add it back.
        return false;
      }
    }

    var filteredSummary = filterSummaryDictionaryByAccess_(summaryContent);
    if (filteredSummary === null) return false;

    var metadataVersion = String(
      props.getProperty("MRH_DECK_METADATA_VERSION") || "0",
    );
    var cacheVersion = setCacheVersionProperties(
      String(Date.now()) +
        "-" +
        Utilities.getUuid().replace(/-/g, "").slice(0, 8),
    );
    var syncSummaryKey = getDeckSyncSummaryCacheKey_(
      cacheVersion,
      metadataVersion,
    );
    if (!cachePutChunked(syncSummaryKey, JSON.stringify(filteredSummary)))
      return false;

    props.setProperty("LAST_MODIFICATION_TIMESTAMP", new Date().toISOString());
    return true;
  } catch (error) {
    LoggerService.log("ERROR", "BUSINESS_LOGIC", "Refresh after UUID metadata edit failed", {}, "refreshDeckSyncAfterMetadataEdit_", error);
    return false;
  }
}

function uuidSheetEdited(e) {
  var edit = getUUIDSheetEditContext_(e);
  if (!edit) return;

  var props = getScriptProps();
  invalidateMetadataCache();

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(BUILDER_LOCK_TIMEOUT_MS)) {
    props.setProperty("REBUILD_PENDING_AFTER_RUN", "true");
    return;
  }

  try {
    if (isDatabaseCacheBuildLeaseActive_()) {
      bumpDatabaseCacheBuildGeneration_();
      props.setProperty("REBUILD_PENDING_AFTER_RUN", "true");
      return;
    }
    if (props.getProperty("REBUILD_QUEUED") === "true") return;
    props.setProperty("REBUILD_QUEUED", "true");

    // Hidden/password edits can update access metadata and the sync index without
    // re-reading all source spreadsheets, provided the existing summary is safe.
    if (edit.metadataOnly && refreshDeckSyncAfterMetadataEdit_()) {
      if (!writeUUIDMetadataBackup_(null, true)) {
        LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("uuidSheetEdited"), "[uuidSheetEdited] Access metadata sync succeeded, but the recovery snapshot was not updated.", { source: "migrated_structured_log", sourceLine: 10642 }, "uuidSheetEdited");
      }
      LoggerService.log("INFO", mrhLoggerCategoryForFunction_("uuidSheetEdited"), "[uuidSheetEdited] Refreshed access metadata without a full database rebuild.", { source: "migrated_structured_log", sourceLine: 10646 }, "uuidSheetEdited");
      return;
    }

    // UUID, Subject, CreatedAt, SourceType, SourceId, header, or unsafe metadata
    // changes require a fresh generation so older in-flight work cannot publish.
    bumpDatabaseCacheBuildGeneration_();
    props.setProperty("FORCE_REBUILD", "true");
    deleteBuildStateFile(true);
    // Build work is invoked only after this handler releases the global lock.
    props.setProperty("MRH_UUID_REBUILD_REQUESTED", "true");
  } catch (error) {
    LoggerService.log("ERROR", "TRIGGER", "UUID sheet edit handler failed", {}, "uuidSheetEdited", error);
  } finally {
    props.deleteProperty("REBUILD_QUEUED");
    lock.releaseLock();
    if (props.getProperty("MRH_UUID_REBUILD_REQUESTED") === "true") {
      props.deleteProperty("MRH_UUID_REBUILD_REQUESTED");
      var rebuildCompleted = buildDatabaseCache();
      if (!rebuildCompleted) {
        LoggerService.log("INFO", mrhLoggerCategoryForFunction_("uuidSheetEdited"), "[uuidSheetEdited] Full rebuild is pending or resumable.", { source: "migrated_structured_log", sourceLine: 10660 }, "uuidSheetEdited");
      }
    }
    if (props.getProperty("REBUILD_PENDING_AFTER_RUN") === "true" && !isDatabaseCacheBuildLeaseActive_()) {
      if (ensureResumeBuildTrigger()) {
        props.deleteProperty("REBUILD_PENDING_AFTER_RUN");
      } else {
        LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("uuidSheetEdited"), "[uuidSheetEdited] Trigger quota reached or busy; pending rebuild deferred to scheduled sync.", { source: "migrated_structured_log", sourceLine: 10677 }, "uuidSheetEdited");
      }
    }
  }
}

function setupTriggers() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(BUILDER_LOCK_TIMEOUT_MS))
    throw new Error("Could not acquire setup lock.");
  try {
    if (isDatabaseCacheBuildLeaseActive_())
      throw new Error("A cache build is active. Retry trigger setup after it finishes.");
    var reviewerConfig = getReviewerAuthorizationConfig_();
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      var handler = triggers[i].getHandlerFunction();
      if (
        handler === "scheduledDatabaseSync" ||
        handler === "uuidSheetEdited" ||
        handler === "mrhAccountsEdited" ||
        handler === "cleanupExpiredReviewerSessionProperties" ||
        handler === "processReviewerStatusNotifications" ||
        handler === "onEdit" ||
        handler === RESUME_TRIGGER_HANDLER
      ) {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }

    var properties = getScriptProps();
    var storedProperties = properties.getProperties();
    Object.keys(storedProperties).forEach(function (key) {
      if (
        key.indexOf("MRH_REVIEWER_STATUS_NOTIFICATION_v1_") === 0 ||
        key.indexOf("MRH_REVIEWER_STATUS_NOTIFICATION_PENDING_v1_") === 0
      )
        properties.deleteProperty(key);
    });

    ScriptApp.newTrigger("uuidSheetEdited")
      .forSpreadsheet(getMRHUuidSpreadsheetId_())
      .onEdit()
      .create();
    if (reviewerConfig.enabled) {
      ScriptApp.newTrigger("cleanupExpiredReviewerSessionProperties")
        .timeBased()
        .everyDays(1)
        .create();
    }
    ScriptApp.newTrigger("scheduledDatabaseSync")
      .timeBased()
      .everyMinutes(5)
      .create();

    return {
      status: "success",
      message:
        "Database triggers installed: UUID edits, daily reviewer-session cleanup, and 5-minute safety sync. Account data is stored in Supabase.",
    };
  } finally {
    lock.releaseLock();
  }
}

function triggerBuildDatabaseCache(sourceSpreadsheetId) {
  return buildDatabaseCache();
}

function forceFullRebuildDatabaseCache() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(BUILDER_LOCK_TIMEOUT_MS))
    throw new Error("Another database operation is currently running.");
  var queued = false;
  try {
    var props = getScriptProps();
    bumpDatabaseCacheBuildGeneration_();
    if (isDatabaseCacheBuildLeaseActive_()) {
      props.setProperty("REBUILD_PENDING_AFTER_RUN", "true");
      props.setProperty("FORCE_REBUILD", "true");
      queued = true;
    } else {
      props.deleteProperty("MRH_SUBJECT_SCHEMA_VERSION");
      props.setProperty("FORCE_REBUILD", "true");
      deleteBuildStateFile(true);
      invalidateMetadataCache();
    }
  } finally {
    lock.releaseLock();
  }
  if (queued) return false;
  return buildDatabaseCache();
}

function resumeBuildDatabaseCache() {
  return buildDatabaseCache();
}

function ensureResumeBuildTrigger(alreadyLocked) {
  var lock = null;
  var acquired = false;

  if (!alreadyLocked) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(BUILDER_LOCK_TIMEOUT_MS)) return false;
    acquired = true;
  }

  try {
    var triggers = ScriptApp.getProjectTriggers();
    var otherCount = 0;
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === RESUME_TRIGGER_HANDLER) {
        ScriptApp.deleteTrigger(triggers[i]);
      } else {
        otherCount++;
      }
    }
    if (otherCount >= 18) {
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("ensureResumeBuildTrigger"), "[ensureResumeBuildTrigger] Trigger quota limit near maximum (" +
          otherCount +
          ").", { source: "migrated_structured_log", sourceLine: 10786 }, "ensureResumeBuildTrigger");
      return false;
    }
    ScriptApp.newTrigger(RESUME_TRIGGER_HANDLER)
      .timeBased()
      .after(10000)
      .create();
    return true;
  } finally {
    if (acquired && lock) lock.releaseLock();
  }
}

function getBuildStateFile(alreadyLocked) {
  var folder = getOrCreateCacheFolder(!!alreadyLocked);
  var files = folder.getFilesByName(BUILD_STATE_FILE_NAME);
  return files.hasNext() ? files.next() : null;
}

function readBuildState(alreadyLocked) {
  var file = getBuildStateFile(alreadyLocked === true);
  if (!file) return null;
  try {
    return JSON.parse(file.getBlob().getDataAsString());
  } catch (error) {
    LoggerService.log("ERROR", "BUSINESS_LOGIC", "Build state file is invalid or unreadable", {
      fileName: BUILD_STATE_FILE_NAME,
    }, "readBuildState", error);
    return null;
  }
}

function compactBuildStateBeforeWrite_(state) {
  if (!state || !Array.isArray(state.liveSources)) return;
  var seen = Object.create(null);
  var compacted = [];
  for (var i = 0; i < state.liveSources.length; i++) {
    var item = state.liveSources[i];
    if (!item || !item.sourceType || !item.sourceId) continue;
    var key = getSourceKey(item.sourceType, item.sourceId);
    if (seen[key]) continue;
    seen[key] = true;
    compacted.push(item);
  }
  state.liveSources = compacted;
}

function writeBuildState(state, alreadyLocked) {
  var folder = getOrCreateCacheFolder(alreadyLocked === true);
  var json = JSON.stringify(state);
  var files = folder.getFilesByName(BUILD_STATE_FILE_NAME);
  var duplicateFilesRemoved = 0;
  if (files.hasNext()) {
    var file = files.next();
    var fileId = mrhLoggerSafeIdentifier_(file.getId());
    file.setContent(json);
    while (files.hasNext()) {
      hardDeleteFile(files.next());
      duplicateFilesRemoved += 1;
    }
    LoggerService.recordOperation_("drive.buildState.updated", 1);
    LoggerService.log("INFO", "BUSINESS_LOGIC", "Build state file updated", {
      service: "DriveApp",
      operation: "setContent",
      fileName: BUILD_STATE_FILE_NAME,
      fileId: fileId,
      contentBytes: mrhLoggerUtf8Length_(json),
      duplicateFilesRemoved: duplicateFilesRemoved,
    }, "writeBuildState");
  } else {
    var createdFile = folder.createFile(BUILD_STATE_FILE_NAME, json, MimeType.PLAIN_TEXT);
    LoggerService.recordOperation_("drive.buildState.created", 1);
    LoggerService.log("INFO", "BUSINESS_LOGIC", "Build state file created", {
      service: "DriveApp",
      operation: "createFile",
      fileName: BUILD_STATE_FILE_NAME,
      fileId: mrhLoggerSafeIdentifier_(createdFile.getId()),
      contentBytes: mrhLoggerUtf8Length_(json),
      affectedFileCount: 1,
    }, "writeBuildState");
  }
}

function deleteBuildStateFile(alreadyLocked) {
  try {
    var file = getBuildStateFile(alreadyLocked === true);
    if (file) hardDeleteFile(file);
  } catch (error) {
    LoggerService.log("ERROR", "BUSINESS_LOGIC", "Build state file deletion failed", {
      fileName: BUILD_STATE_FILE_NAME,
    }, "deleteBuildStateFile", error);
  }
}

function isValidBuildState(state, cacheFolderId) {
  if (
    !state ||
    typeof state !== "object" ||
    Array.isArray(state) ||
    state.subjectSchemaVersion !== SUBJECT_SCHEMA_VERSION ||
    String(state.cacheFolderId || "") !== String(cacheFolderId || "") ||
    !Array.isArray(state.folderQueue) ||
    state.folderQueue.length === 0 ||
    !Array.isArray(state.liveSources)
  )
    return false;

  for (var i = 0; i < state.folderQueue.length; i++) {
    var folder = state.folderQueue[i];
    if (
      !folder ||
      typeof folder !== "object" ||
      !String(folder.id || "").trim() ||
      typeof folder.pathPrefix !== "string"
    )
      return false;
  }

  var objectFields = [
    "summaryMap",
    "questionTypes",
    "payloadVersions",
    "oldPayloadVersions",
    "seenSubjects",
    "newFileTimestamps",
    "newFileMetadata",
    "oldSummaryMap",
    "oldQuestionTypes",
  ];
  for (var j = 0; j < objectFields.length; j++) {
    var value = state[objectFields[j]];
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
  }

  return true;
}

/**
 * Prepare/recover persisted build state and return the context shared by the
 * traversal and finalization phases. The public buildDatabaseCache entry point
 * retains all lock and failure-state handling for trigger compatibility.
 */
function prepareDatabaseCacheBuildContext_(startTime, props, buildLeaseToken, buildGeneration, callerAlreadyLocked) {
  // Check ownership between preparation stages as well as after preparation.
  // Preparation can repair metadata and delete stale build state, so a build
  // invalidated by an edit must stop before it performs further repairs.
  var preparationGuard = {
    buildLeaseToken: buildLeaseToken || "",
    buildGeneration: buildGeneration,
    props: props,
    callerAlreadyLocked: callerAlreadyLocked === true,
  };
  assertDatabaseCacheBuildCurrent_(preparationGuard, "before preparation");

  // Restore removed metadata for still-live sources before ID migration and
  // reconciliation. This protects UUIDs and access settings from accidental
  // row deletion; the later Drive reconciliation drops genuinely stale rows.
  var cacheFolder = getOrCreateCacheFolder();
  assertDatabaseCacheBuildCurrent_(preparationGuard, "after cache-folder resolution");
  var restoredUUIDRows = restoreMissingUUIDMetadataFromBackup_(cacheFolder, preparationGuard.callerAlreadyLocked);
  assertDatabaseCacheBuildCurrent_(preparationGuard, "after UUID metadata restoration");
  invalidateMetadataCache();
  if (restoredUUIDRows > 0) {
    props.setProperty("FORCE_REBUILD", "true");
    deleteBuildStateFile();
    invalidateMetadataCache();
  }

  // Repair persisted IDs before any deck is read or written. Only invalid or
  // duplicate IDs are replaced; existing valid IDs remain stable.
  var deckIdsMigrated = migrateDeckMetadataIdsToSixDigits_(preparationGuard.callerAlreadyLocked);
  assertDatabaseCacheBuildCurrent_(preparationGuard, "after deck-ID migration");
  if (deckIdsMigrated) {
    props.setProperty("FORCE_REBUILD", "true");
    deleteBuildStateFile();
    invalidateMetadataCache();
  }

  var storedSchema = props.getProperty("MRH_SUBJECT_SCHEMA_VERSION") || "";
  var schemaChanged = storedSchema !== SUBJECT_SCHEMA_VERSION;
  if (schemaChanged) {
    deleteBuildStateFile();
    props.setProperty("FORCE_REBUILD", "true");
  }

  var force = props.getProperty("FORCE_REBUILD") === "true" || schemaChanged;
  var state = readBuildState();

  if (state && state.subjectSchemaVersion !== SUBJECT_SCHEMA_VERSION) {
    state = null;
    deleteBuildStateFile();
    force = true;
  }

  if (state && !isValidBuildState(state, cacheFolder.getId())) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("prepareDatabaseCacheBuildContext_"), "[buildDatabaseCache] Discarding invalid or stale build state.", { source: "migrated_structured_log", sourceLine: 10972 }, "prepareDatabaseCacheBuildContext_");
    state = null;
    deleteBuildStateFile();
    force = true;
    props.setProperty("FORCE_REBUILD", "true");
  }
  if (
    state &&
    props.getProperty("MRH_DECK_PAGE_STORAGE_MIGRATION_QUEUED") === "true" &&
    !state.isFullRebuild
  ) {
    state = null;
    deleteBuildStateFile();
    force = true;
  }

  var oldSummaryMap = Object.create(null);
  var oldQuestionTypes = Object.create(null);
  var oldExplanationMap = Object.create(null);
  var oldPayloadVersions = Object.create(null);

  // Read stored file index from cache folder (avoids 9KB ScriptProperties quota).
  var persistentIndex = readPersistentFileIndex(cacheFolder);
  assertDatabaseCacheBuildCurrent_(preparationGuard, "after persistent-index read");
  var oldFileTimestamps = persistentIndex.timestamps || {};
  var oldFileMetadata = persistentIndex.metadata || {};

  if (!state) {
    if (!force) {
      var summaryFiles = findCacheFilesByName(
        cacheFolder,
        "MRH_Summary.json",
      );
      if (summaryFiles.hasNext()) {
        try {
          var parsedSummary = JSON.parse(
            summaryFiles.next().getBlob().getDataAsString(),
          );
          var priorEntries = decodeSummaryDictionary(parsedSummary);
          if (priorEntries) {
            for (var s = 0; s < priorEntries.length; s++) {
              if (priorEntries[s] && priorEntries[s].s) {
                var priorSubject = normalizeSubject(priorEntries[s].s);
                oldSummaryMap[priorSubject] = Number(priorEntries[s].c || 0);
                oldQuestionTypes[priorSubject] = priorEntries[s].t || "ID";
                oldExplanationMap[priorSubject] =
                  priorEntries[s].e === "t" || priorEntries[s].e === true;
                oldPayloadVersions[priorSubject] = String(
                  priorEntries[s].h || "",
                );
              }
            }
          }
        } catch (summaryError) {
          force = true;
        }
      } else {
        force = true;
      }
    }

    state = {
      subjectSchemaVersion: SUBJECT_SCHEMA_VERSION,
      folderQueue: [{ id: getMRHDatabaseFolderId_(), pathPrefix: "" }],
      summaryMap: Object.create(null),
      questionTypes: Object.create(null),
      seenSubjects: Object.create(null), // Track first-occurrence winning subjects
      liveSources: [],
      newFileTimestamps: Object.create(null),
      newFileMetadata: Object.create(null),
      oldSummaryMap: oldSummaryMap,
      oldQuestionTypes: oldQuestionTypes,
      oldExplanationMap: oldExplanationMap,
      oldPayloadVersions: oldPayloadVersions,
      payloadVersions: Object.create(null),
      hasExplanations: Object.create(null),
      cacheFolderId: cacheFolder.getId(),
      isFullRebuild: force,
    };
  }

  state.summaryMap = Object.assign(
    Object.create(null),
    state.summaryMap || {},
  );
  state.questionTypes = Object.assign(
    Object.create(null),
    state.questionTypes || {},
  );
  state.payloadVersions = Object.assign(
    Object.create(null),
    state.payloadVersions || {},
  );
  state.seenSubjects = Object.assign(
    Object.create(null),
    state.seenSubjects || {},
  );
  state.newFileTimestamps = Object.assign(
    Object.create(null),
    state.newFileTimestamps || {},
  );
  state.newFileMetadata = Object.assign(
    Object.create(null),
    state.newFileMetadata || {},
  );
  state.oldSummaryMap = Object.assign(
    Object.create(null),
    state.oldSummaryMap || {},
  );
  state.oldQuestionTypes = Object.assign(
    Object.create(null),
    state.oldQuestionTypes || {},
  );
  state.oldExplanationMap = Object.assign(
    Object.create(null),
    state.oldExplanationMap || {},
  );
  state.oldPayloadVersions = Object.assign(
    Object.create(null),
    state.oldPayloadVersions || {},
  );
  state.hasExplanations = Object.assign(
    Object.create(null),
    state.hasExplanations || {},
  );
  // Legacy state files embedded the previous full file index. Drop those
  // copies immediately; the authoritative index remains in MRH_FileIndex.json.
  delete state.oldFileTimestamps;
  delete state.oldFileMetadata;
  state.liveSources = Array.isArray(state.liveSources)
    ? state.liveSources
    : [];
  state.folderQueue = Array.isArray(state.folderQueue)
    ? state.folderQueue
    : [];
  state.extractionWarnings = Array.isArray(state.extractionWarnings)
    ? state.extractionWarnings
    : [];

  state.cacheFolderId = cacheFolder.getId();
  assertDatabaseCacheBuildCurrent_(preparationGuard, "preparation complete");
  return {
    startTime: startTime,
    props: props,
    cacheFolder: cacheFolder,
    state: state,
    oldFileTimestamps: oldFileTimestamps,
    oldFileMetadata: oldFileMetadata,
  };
}

/** Traverse source folders, incrementally persisting resumable build state. */
function traverseDatabaseCacheSources_(context) {
  var startTime = context.startTime;
  var cacheFolder = context.cacheFolder;
  var state = context.state;
  var oldFileTimestamps = context.oldFileTimestamps;
  var oldFileMetadata = context.oldFileMetadata;
  var generationCheckCounter = 0;
  while (state.folderQueue.length) {
    if (context.buildLeaseToken)
      assertDatabaseCacheBuildCurrent_(context, "source traversal folder boundary");
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      compactBuildStateBeforeWrite_(state);
      writeBuildState(state);
      ensureResumeBuildTrigger();
      return false;
    }

    var current = state.folderQueue.pop();
    var folder;
    try {
      folder = mrhLoggedDriveGetFolderById_(current.id);
    } catch (folderError) {
      deleteBuildStateFile();
      throw new Error(
        "Unable to access database folder '" +
          String(current.pathPrefix || current.id) +
          "': " +
          folderError,
      );
    }

    var pathPrefix = current.pathPrefix || "";
    if (pathPrefix) {
      state.liveSources.push({
        sourceType: "folder",
        sourceId: folder.getId(),
        subject: pathPrefix,
      });
    }

    var files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
    while (files.hasNext()) {
      generationCheckCounter++;
      if (context.buildLeaseToken && generationCheckCounter % 50 === 0)
        assertDatabaseCacheBuildCurrent_(context, "source traversal file boundary");
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        state.folderQueue.push(current);
        compactBuildStateBeforeWrite_(state);
        writeBuildState(state);
        ensureResumeBuildTrigger();
        return false;
      }

      var file = files.next();
      var fileId = file.getId();
      var fileName = file.getName();

      if (
        fileName === "MRH_Passwords" ||
        fileName === "MRH_Access" ||
        fileName === "MRH_Access.json" ||
        /^deck-[A-F0-9-]+\.json$/i.test(fileName) ||
        /^\d{6}-deck\.json$/i.test(fileName) ||
        /^\d{6}-page(?:-\d+)?\.json$/i.test(fileName)
      )
        continue;

      var updated = file.getLastUpdated().getTime();
      state.newFileTimestamps[fileId] = updated;

      var previousTimestamp = Number(oldFileTimestamps[fileId] || 0);
      var cachedMeta = oldFileMetadata[fileId];

      // A previous resume may restart this folder from its first file. Avoid
      // re-opening/re-extracting files already fully completed in this build.
      // If a timeout interrupted a multi-sheet file, at least one subject will
      // be missing from summaryMap, so that file is retried safely.
      var completedMeta = state.newFileMetadata[fileId];
      if (completedMeta && Array.isArray(completedMeta.subjects)) {
        var completedAllSubjects = true;
        for (var doneIndex = 0; doneIndex < completedMeta.subjects.length; doneIndex++) {
          if (!Object.prototype.hasOwnProperty.call(
            state.summaryMap,
            completedMeta.subjects[doneIndex],
          )) {
            completedAllSubjects = false;
            break;
          }
        }
        if (completedAllSubjects) {
          state.newFileTimestamps[fileId] = updated;
          continue;
        }
      }

      // -------------------------------------------------------------------
      // PERFORMANCE OPTIMIZATION:
      // Skip SpreadsheetApp.open() completely if the file is unmodified.
      // -------------------------------------------------------------------
      var isUnmodified =
        !state.isFullRebuild &&
        updated <= previousTimestamp &&
        cachedMeta &&
        Array.isArray(cachedMeta.subjects) &&
        cachedMeta.subjects.length > 0 &&
        cachedMeta.pathPrefix === pathPrefix &&
        cachedMeta.fileName === fileName;

      if (isUnmodified) {
        var canReuse = true;
        for (var u = 0; u < cachedMeta.subjects.length; u++) {
          var subj = cachedMeta.subjects[u];
          if (state.oldSummaryMap[subj] === undefined) {
            canReuse = false;
            break;
          }
        }

        if (canReuse) {
          for (var k = 0; k < cachedMeta.subjects.length; k++) {
            var sName = cachedMeta.subjects[k];
            var sId = cachedMeta.sourceIds[k];

            // Enforce first-occurrence precedence
            if (!state.seenSubjects[sName]) {
              state.seenSubjects[sName] = true;
              state.summaryMap[sName] = state.oldSummaryMap[sName];
              state.questionTypes[sName] =
                state.oldQuestionTypes[sName] || "ID";
              state.hasExplanations[sName] = Boolean(
                state.oldExplanationMap[sName],
              );
              state.payloadVersions[sName] =
                state.oldPayloadVersions[sName] || "";
              state.liveSources.push({
                sourceType: "deck",
                sourceId: sId,
                subject: sName,
              });
            }
          }
          state.newFileMetadata[fileId] = cachedMeta;
          continue; // Skipped opening spreadsheet entirely!
        }
      }

      // File modified or full rebuild required: Open spreadsheet.
      var ss = mrhLoggedSpreadsheetOpen_(file, "database build source");
      var sheets = ss.getSheets();
      var isSingle = sheets.length === 1;
      var currentSubjects = [];
      var currentSourceIds = [];

      for (var sh = 0; sh < sheets.length; sh++) {
        var sheet = sheets[sh];
        var subject = buildSpreadsheetSubject(
          pathPrefix,
          fileName,
          sheet.getName(),
          isSingle,
        );
        var sourceId = isSingle ? fileId : fileId + "::" + sheet.getSheetId();

        currentSubjects.push(subject);
        currentSourceIds.push(sourceId);

        if (!state.seenSubjects[subject]) {
          state.seenSubjects[subject] = true;
          state.liveSources.push({
            sourceType: "deck",
            sourceId: sourceId,
            subject: subject,
          });
        }
      }

      state.newFileMetadata[fileId] = {
        pathPrefix: pathPrefix,
        fileName: fileName,
        subjects: currentSubjects,
        sourceIds: currentSourceIds,
      };

      // Extract and cache questions
      for (var sh2 = 0; sh2 < sheets.length; sh2++) {
        generationCheckCounter++;
        if (context.buildLeaseToken && generationCheckCounter % 50 === 0)
          assertDatabaseCacheBuildCurrent_(context, "source traversal sheet boundary");
        if (Date.now() - startTime > MAX_RUNTIME_MS) {
          state.folderQueue.push(current);
          compactBuildStateBeforeWrite_(state);
          writeBuildState(state);
          ensureResumeBuildTrigger();
          return false;
        }

        var activeSheet = sheets[sh2];
        var activeSubject = currentSubjects[sh2];
        var activeSourceId = currentSourceIds[sh2];

        // If another sheet earlier claimed this subject, skip duplicate extraction
        if (
          state.summaryMap[activeSubject] !== undefined &&
          !state.isFullRebuild
        ) {
          continue;
        }

        var qData = extractQuestionsOptimized(
          activeSheet,
          activeSubject,
          state.extractionWarnings,
        );
        if (state.extractionWarnings.length > 500)
          state.extractionWarnings = state.extractionWarnings.slice(-500);

        state.summaryMap[activeSubject] = qData.length;
        state.questionTypes[activeSubject] = analyzeQuestionTypes(qData);
        state.hasExplanations[activeSubject] = hasUsableExplanation(qData);

        var deckUUID = ensureDeckUUID(activeSubject, "deck", activeSourceId, context.callerAlreadyLocked);
        if (qData.length > 0) {
          var encodedQuestions = encodeDeckQuestions(qData);
          var encodedDeck = JSON.stringify(encodedQuestions);
          var payloadVersion = sha256Hex(encodedDeck);
          updateOrCreateCacheFile(
            cacheFolder,
            "deck-" + deckUUID + ".json",
            encodedDeck,
          );
          writeDeckPageFiles_(
            cacheFolder,
            deckUUID,
            encodedQuestions,
            payloadVersion,
          );
          state.payloadVersions[activeSubject] = payloadVersion;
        } else {
          state.payloadVersions[activeSubject] = sha256Hex("[]");
          var emptyFiles = findCacheFilesByName(
            cacheFolder,
            "deck-" + deckUUID + ".json",
          );
          while (emptyFiles.hasNext()) hardDeleteFile(emptyFiles.next());
          removeDeckPageFiles_(cacheFolder, deckUUID);
        }
      }
    }

    var subFolders = folder.getFolders();
    while (subFolders.hasNext()) {
      var child = subFolders.next();
      var nextPath = pathPrefix
        ? pathPrefix + "::" + child.getName()
        : child.getName();
      state.folderQueue.push({ id: child.getId(), pathPrefix: nextPath });
    }
  }

  return true;
}

/**
 * Verify that this build still owns the current cache generation before it
 * performs finalization or publication. If an edit/rebuild arrived, queue a new
 * generation instead of allowing this stale snapshot to become the active cache.
 */
function assertDatabaseCacheBuildCurrent_(context, stage) {
  if (!context || !context.buildLeaseToken) return true; // legacy direct helper call
  var props = context.props || getScriptProps();
  var checkedAt = Date.now();
  var lease = readDatabaseCacheBuildLease_();
  var expectedGeneration = Number(context.buildGeneration);
  var currentGeneration = getDatabaseCacheBuildGeneration_();
  var isCurrent = Boolean(
    lease &&
    lease.token === context.buildLeaseToken &&
    Number(lease.expiresAt) > checkedAt &&
    Number(lease.generation) === expectedGeneration &&
    currentGeneration === expectedGeneration &&
    props.getProperty("REBUILD_PENDING_AFTER_RUN") !== "true"
  );
  if (isCurrent) {
    // The lease is intentionally longer than a normal build execution. Refreshing
    // it on every folder/file/sheet boundary caused repeated 15-second lock waits
    // and could abort a valid build merely because another request held the lock.
    // Most checks only verify ownership; refresh when expiry is getting close.
    var remainingLeaseMs = Number(lease.expiresAt) - checkedAt;
    if (remainingLeaseMs > MRH_CACHE_BUILD_LEASE_REFRESH_THRESHOLD_MS_) return true;
    if (
      Number(context.leaseRefreshRetryAfter) > checkedAt &&
      remainingLeaseMs > 1000
    ) return true;

    var alreadyLocked = context.callerAlreadyLocked === true || context.publicationLockHeld === true;
    if (refreshDatabaseCacheBuildLease_(
      context.buildLeaseToken,
      alreadyLocked,
      MRH_CACHE_BUILD_LEASE_REFRESH_LOCK_TIMEOUT_MS_,
    )) {
      context.leaseRefreshRetryAfter = 0;
      return true;
    }

    // A short refresh-lock miss is not evidence that ownership was lost. Re-read
    // the lease and generation: continue only if this token remains current and
    // unexpired. A later boundary will retry the refresh, and expiration/token
    // replacement still aborts the old build before it can be published.
    var latestLease = readDatabaseCacheBuildLease_();
    var latestGeneration = getDatabaseCacheBuildGeneration_();
    var stillCurrent = Boolean(
      latestLease &&
      latestLease.token === context.buildLeaseToken &&
      Number(latestLease.expiresAt) > Date.now() &&
      Number(latestLease.generation) === expectedGeneration &&
      latestGeneration === expectedGeneration &&
      props.getProperty("REBUILD_PENDING_AFTER_RUN") !== "true"
    );
    if (stillCurrent) {
      // Avoid a short lock wait at every sheet/file boundary during contention.
      // Retry in five seconds; never defer beyond the remaining lease lifetime.
      context.leaseRefreshRetryAfter = Date.now() + 5000;
      return true;
    }
  }

  // Best effort: request a fresh build even if this check was reached after an
  // edit handler could not acquire the short script lock.
  props.setProperty("REBUILD_PENDING_AFTER_RUN", "true");
  props.setProperty("FORCE_REBUILD", "true");
  var staleError = new Error("Cache build generation became stale at " + String(stage || "unknown stage") + "; publication was cancelled.");
  staleError.code = "CACHE_BUILD_STALE";
  throw staleError;
}

/** Reconcile metadata, write the final summary/index, and clean orphaned cache files. */
function finalizeDatabaseCacheBuild_(context) {
  assertDatabaseCacheBuildCurrent_(context, "finalization start");
  var props = context.props;
  var cacheFolder = context.cacheFolder;
  var state = context.state;
  // Deduplicate live source identities accumulated across resumed iterations.
  var uniqueLive = Object.create(null);
  var dedupedLiveSources = [];
  for (var li = 0; li < state.liveSources.length; li++) {
    var liveSource = state.liveSources[li];
    var liveKey = getSourceKey(liveSource.sourceType, liveSource.sourceId);
    if (!uniqueLive[liveKey]) {
      uniqueLive[liveKey] = true;
      dedupedLiveSources.push(liveSource);
    }
  }
  state.liveSources = dedupedLiveSources;

  var liveDedupeResult = dedupeLiveSubjects(state.liveSources);
  if (liveDedupeResult.duplicates.length) {
    state.liveSources = liveDedupeResult.deduped;
  }
  assertDatabaseCacheBuildCurrent_(context, "before metadata reconciliation");
  reconcileMetadataToLiveSources(state.liveSources, context.callerAlreadyLocked);
  assertDatabaseCacheBuildCurrent_(context, "after metadata reconciliation");
  normalizeUUIDSheetParentSubjects(context.callerAlreadyLocked);
  assertDatabaseCacheBuildCurrent_(context, "after UUID parent normalization");
  invalidateMetadataCache();

  for (var lsi = 0; lsi < state.liveSources.length; lsi++) {
    if (lsi % 50 === 0) assertDatabaseCacheBuildCurrent_(context, "deck UUID repair");
    if (state.liveSources[lsi].sourceType !== "deck") continue;
    ensureDeckUUID(
      state.liveSources[lsi].subject,
      "deck",
      state.liveSources[lsi].sourceId,
      context.callerAlreadyLocked,
    );
  }
  invalidateMetadataCache();
  assertDatabaseCacheBuildCurrent_(context, "after deck UUID repair");

  var compactSummary = buildSummaryArrayFromAccessState(state);
  var summaryJson = JSON.stringify(compactSummary);

  // The summary and cache-version pointer are published only after source
  // traversal, orphan reconciliation, and the persistent index have completed.
  // This keeps clients from observing the new generation during final cleanup.

  assertDatabaseCacheBuildCurrent_(context, "before extraction-warning publication");
  var extractionWarnings = state.extractionWarnings || [];
  if (extractionWarnings.length) {
    updateOrCreateCacheFile(
      cacheFolder,
      "MRH_ExtractionWarnings.json",
      JSON.stringify(extractionWarnings.slice(-500)),
    );
    props.setProperty(
      "MRH_EXTRACTION_WARNING_COUNT",
      String(extractionWarnings.length),
    );
  } else {
    var staleWarningFiles = findCacheFilesByName(
      cacheFolder,
      "MRH_ExtractionWarnings.json",
    );
    while (staleWarningFiles.hasNext())
      hardDeleteFile(staleWarningFiles.next());
    props.deleteProperty("MRH_EXTRACTION_WARNING_COUNT");
  }

  // Do not delete cache artifacts if a newer source generation arrived during
  // finalization. Check again as the potentially large directory is traversed.
  assertDatabaseCacheBuildCurrent_(context, "before orphan cleanup");
  // Purge orphaned deck cache files
  var liveUUIDs = Object.create(null);
  var metadataFinal = loadDeckMetadataMap(true);
  for (var cachedSubject in state.summaryMap) {
    if (
      !Object.prototype.hasOwnProperty.call(state.summaryMap, cachedSubject)
    )
      continue;
    if (Number(state.summaryMap[cachedSubject] || 0) <= 0) continue;
    if (metadataFinal[cachedSubject] && metadataFinal[cachedSubject].uuid)
      liveUUIDs[metadataFinal[cachedSubject].uuid] = true;
  }

  var cachedFiles = cacheFolder.getFiles();
  var inspectedCachedFiles = 0;
  while (cachedFiles.hasNext()) {
    if (inspectedCachedFiles % 100 === 0)
      assertDatabaseCacheBuildCurrent_(context, "orphan cleanup");
    inspectedCachedFiles++;
    var cFile = cachedFiles.next();
    var cName = cFile.getName();
    var match = /^deck-([A-Z0-9-]+)(?:\.page-(?:[A-F0-9]{64}-)?\d+|\.pages)?\.json$/i.exec(cName);
    var newMatch = /^(\d{6})-(?:deck|page(?:-\d+)?)\.json$/i.exec(cName);
    var cacheUUID = match ? match[1] : (newMatch ? newMatch[1] : null);
    if (cacheUUID && !liveUUIDs[cacheUUID]) hardDeleteFile(cFile);
    if (/^SUBJ_/.test(cName)) hardDeleteFile(cFile);
    if (
      [
        "MRH_Access",
        "MRH_Access.json",
        "MRH_Passwords",
        "MRH_Passwords.json",
      ].indexOf(cName) !== -1
    )
      hardDeleteFile(cFile);
  }

  // Persist large file index to Drive cache folder (avoids 9KB ScriptProperties quota)
  writePersistentFileIndex(
    cacheFolder,
    state.newFileTimestamps,
    state.newFileMetadata,
  );
  if (!writeUUIDMetadataBackup_(cacheFolder)) {
    LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("finalizeDatabaseCacheBuild_"), "[buildDatabaseCache] UUID metadata backup was not updated; the build itself completed.", { source: "migrated_structured_log", sourceLine: 11499 }, "finalizeDatabaseCacheBuild_");
  }

  assertDatabaseCacheBuildCurrent_(context, "before summary-cache preparation");
  // Populate the version-keyed in-memory summary before acquiring the publication
  // lock. The candidate version is unique and remains invisible until its version
  // pointer is published; an aborted build leaves only expiring orphan cache keys.
  var publicationVersionCandidate = String(Date.now()) + "-" + Utilities.getUuid().replace(/-/g, "").slice(0, 8);
  var publicationMetadataVersion = String(props.getProperty("MRH_DECK_METADATA_VERSION") || "0");
  var summaryCacheReady = cachePutChunked(
    getDeckSyncSummaryCacheKey_(publicationVersionCandidate, publicationMetadataVersion),
    summaryJson,
  );
  if (!summaryCacheReady) {
    LoggerService.log("WARN", mrhLoggerCategoryForFunction_("finalizeDatabaseCacheBuild_"), "Summary cache prepopulation failed; the persistent summary remains available for fallback reads.", { source: "summary_cache_prepublication" }, "finalizeDatabaseCacheBuild_");
  }
  assertDatabaseCacheBuildCurrent_(context, "before publication");
  var version = publishDatabaseCacheSummary_(
    context, summaryJson, publicationVersionCandidate, publicationMetadataVersion,
  );
  // Keep the resumable Drive state removal outside the publication lock. The
  // lease remains active until buildDatabaseCache's finally block, so another
  // build cannot race this cleanup.
  deleteBuildStateFile();
  return Boolean(version);

}

/**
 * Publish the final summary and version pointer in one short global-lock window.
 * All long source traversal and orphan scanning work remains outside the lock.
 */
function publishDatabaseCacheSummary_(context, summaryJson, versionCandidate, metadataVersionCandidate) {
  var props = context.props;
  var cacheFolder = context.cacheFolder;
  var state = context.state;
  var version = String(versionCandidate || (String(Date.now()) + "-" + Utilities.getUuid().replace(/-/g, "").slice(0, 8)));
  var metadataVersion = String(metadataVersionCandidate == null ? (props.getProperty("MRH_DECK_METADATA_VERSION") || "0") : metadataVersionCandidate);
  var lock = null;
  var acquired = false;
  if (context.callerAlreadyLocked !== true) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(BUILDER_LOCK_TIMEOUT_MS)) {
      props.setProperty("REBUILD_PENDING_AFTER_RUN", "true");
      props.setProperty("FORCE_REBUILD", "true");
      var busyError = new Error("Could not acquire the short cache publication lock.");
      busyError.code = "CACHE_PUBLICATION_BUSY";
      throw busyError;
    }
    acquired = true;
  }
  context.publicationLockHeld = true;
  try {
    assertDatabaseCacheBuildCurrent_(context, "publication lock acquired");
    if (String(props.getProperty("MRH_DECK_METADATA_VERSION") || "0") !== metadataVersion) {
      props.setProperty("REBUILD_PENDING_AFTER_RUN", "true");
      props.setProperty("FORCE_REBUILD", "true");
      var metadataStaleError = new Error("Deck metadata version changed before cache publication.");
      metadataStaleError.code = "CACHE_BUILD_STALE";
      throw metadataStaleError;
    }
    updateOrCreateCacheFile(cacheFolder, "MRH_Summary.json", summaryJson);
    // A lock-timeout edit handler can set this flag without owning the lock.
    // Check before advancing the visible cache version so stale work is not
    // announced as a completed generation.
    assertDatabaseCacheBuildCurrent_(context, "summary file written");
    if (String(props.getProperty("MRH_DECK_METADATA_VERSION") || "0") !== metadataVersion) {
      props.setProperty("REBUILD_PENDING_AFTER_RUN", "true");
      props.setProperty("FORCE_REBUILD", "true");
      var metadataChangedError = new Error("Deck metadata version changed during cache publication.");
      metadataChangedError.code = "CACHE_BUILD_STALE";
      throw metadataChangedError;
    }
    setCacheVersionProperties(version);
    props.setProperty("MRH_CACHE_METADATA_VERSION", metadataVersion);
    var completedAt = new Date().toISOString();
    props.setProperty("LAST_CACHE_BUILD_SUCCESS", completedAt);
    props.setProperty("LAST_MODIFICATION_TIMESTAMP", completedAt);
    props.setProperty("PERM_FOLDER_ID", cacheFolder.getId());
    props.setProperty("MRH_SUBJECT_SCHEMA_VERSION", SUBJECT_SCHEMA_VERSION);
    if (state.isFullRebuild) {
      props.setProperty("MRH_DECK_PAGE_STORAGE_VERSION", "1");
      props.deleteProperty("MRH_DECK_PAGE_STORAGE_MIGRATION_QUEUED");
      props.deleteProperty("MRH_DECK_PAGE_STORAGE_MIGRATION_RETRY_AFTER");
    }
    props.setProperty("BUILD_STATUS", "IDLE");
    props.setProperty("LAST_CACHE_BUILD_VERSION", version);
    props.deleteProperty("BUILD_CACHE_STATE");
    props.deleteProperty("FORCE_REBUILD");
    props.deleteProperty("BUILD_LAST_ERROR");
    clearResumeTriggers();
    return version;
  } finally {
    context.publicationLockHeld = false;
    if (acquired && lock) lock.releaseLock();
  }
}

/**
 * Short critical-section lease for cache builds. The global script lock protects
 * lease acquisition/release only; expensive Drive/Spreadsheet traversal runs
 * after it is released. UUID edits and destructive cache operations defer while
 * this lease is active. A stale lease expires after an execution cannot remain
 * alive, allowing recovery after an Apps Script termination.
 */
function getDatabaseCacheBuildGeneration_() {
  var raw = String(getScriptProps().getProperty(MRH_CACHE_BUILD_GENERATION_PROPERTY_) || "0");
  if (!/^(?:0|[1-9][0-9]*)$/.test(raw)) return 0;
  var value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

// Call while holding the script lock. The generation marks cache-affecting
// edits that occur while traversal is running, so stale work cannot be published.
function bumpDatabaseCacheBuildGeneration_() {
  var props = getScriptProps();
  var current = getDatabaseCacheBuildGeneration_();
  var next = Number.isSafeInteger(current + 1) ? current + 1 : 1;
  props.setProperty(MRH_CACHE_BUILD_GENERATION_PROPERTY_, String(next));
  return next;
}

function readDatabaseCacheBuildLease_() {
  var raw = String(getScriptProps().getProperty(MRH_CACHE_BUILD_LEASE_PROPERTY_) || "");
  if (!raw) return null;
  try {
    var lease = JSON.parse(raw);
    if (!lease || !/^[A-Za-z0-9-]{20,80}$/.test(String(lease.token || "")) ||
        !Number.isFinite(Number(lease.expiresAt))) return null;
    if (!Number.isSafeInteger(Number(lease.generation)) || Number(lease.generation) < 0)
      lease.generation = 0;
    return lease;
  } catch (ignored) { return null; }
}

function isDatabaseCacheBuildLeaseActive_() {
  var lease = readDatabaseCacheBuildLease_();
  return Boolean(lease && Number(lease.expiresAt) > Date.now());
}

function acquireDatabaseCacheBuildLease_(callerAlreadyLocked) {
  var lock = null;
  if (callerAlreadyLocked !== true) {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(BUILDER_LOCK_TIMEOUT_MS)) return "";
  }
  try {
    var props = getScriptProps();
    var existing = readDatabaseCacheBuildLease_();
    if (existing && Number(existing.expiresAt) > Date.now()) return "";
    if (props.getProperty(MRH_CACHE_BUILD_LEASE_PROPERTY_))
      props.deleteProperty(MRH_CACHE_BUILD_LEASE_PROPERTY_);
    var token = String(Utilities.getUuid() || "").toLowerCase();
    if (!/^[0-9a-f-]{36}$/.test(token)) throw new Error("Unable to create a cache-build lease token.");
    var generation = getDatabaseCacheBuildGeneration_();
    props.setProperty(MRH_CACHE_BUILD_LEASE_PROPERTY_, JSON.stringify({
      token: token,
      generation: generation,
      startedAt: Date.now(),
      expiresAt: Date.now() + MRH_CACHE_BUILD_LEASE_TTL_MS_,
    }));
    return token;
  } finally { if (lock) lock.releaseLock(); }
}

function refreshDatabaseCacheBuildLease_(token, callerAlreadyLocked, lockTimeoutMs) {
  if (!token) return false;
  var lock = null;
  if (callerAlreadyLocked !== true) {
    lock = LockService.getScriptLock();
    var timeout = Number(lockTimeoutMs);
    if (!Number.isFinite(timeout) || timeout < 0) timeout = BUILDER_LOCK_TIMEOUT_MS;
    if (!lock.tryLock(Math.floor(timeout))) return false;
  }
  try {
    var lease = readDatabaseCacheBuildLease_();
    if (!lease || lease.token !== token ||
        Number(lease.generation) !== getDatabaseCacheBuildGeneration_() ||
        Number(lease.expiresAt) <= Date.now()) return false;
    lease.expiresAt = Date.now() + MRH_CACHE_BUILD_LEASE_TTL_MS_;
    getScriptProps().setProperty(MRH_CACHE_BUILD_LEASE_PROPERTY_, JSON.stringify(lease));
    return true;
  } finally {
    if (lock) lock.releaseLock();
  }
}

function releaseDatabaseCacheBuildLease_(token, callerAlreadyLocked) {
  if (!token) return;
  var lock = null;
  if (callerAlreadyLocked !== true) {
    lock = LockService.getScriptLock();
    // If the short lock window is busy, leave the lease to expire safely rather
    // than clearing it without synchronization and risking a concurrent build.
    if (!lock.tryLock(BUILDER_LOCK_TIMEOUT_MS)) return;
  }
  try {
    var props = getScriptProps();
    var lease = readDatabaseCacheBuildLease_();
    if (!lease || lease.token !== token) return;
    props.deleteProperty(MRH_CACHE_BUILD_LEASE_PROPERTY_);
    if (props.getProperty("REBUILD_PENDING_AFTER_RUN") === "true") {
      props.deleteProperty("REBUILD_PENDING_AFTER_RUN");
      props.setProperty("FORCE_REBUILD", "true");
      deleteBuildStateFile(true);
      props.deleteProperty("BUILD_CACHE_STATE");
      props.setProperty("BUILD_STATUS", "IDLE");
      // The legacy callerAlreadyLocked path still owns the global lock.
      ensureResumeBuildTrigger(true);
    }
  } finally { if (lock) lock.releaseLock(); }
}

/**
 * Main cache-build orchestration entry point. The detailed workflow is split
 * into preparation, traversal, and finalization helpers without changing the
 * public name/signature used by existing triggers and manual operations.
 */
function buildDatabaseCache(alreadyLocked) {
  // `alreadyLocked` is retained for compatibility with old callers, but all
  // in-file callers release the global lock before entering this function.
  var callerAlreadyLocked = alreadyLocked === true;
  var leaseToken = acquireDatabaseCacheBuildLease_(callerAlreadyLocked);
  if (!leaseToken) {
    LoggerService.log("INFO", mrhLoggerCategoryForFunction_("buildDatabaseCache"), "[buildDatabaseCache] Another build is already active; this invocation was skipped.", { source: "build_lease", reason: "LEASE_ACTIVE_OR_LOCK_BUSY" }, "buildDatabaseCache");
    return false;
  }

  // Capture the generation from the lease acquired at the beginning, before
  // any Drive/Spreadsheet preparation. Reading the current generation after
  // preparation can accidentally adopt an edit that happened while preparing
  // and let a stale snapshot pass the publication guard. Keep this read inside
  // try/finally so a transient property-service error cannot strand the lease.
  var buildGenerationAtStart = null;
  var startTime = Date.now();
  var props = null;
  try {
    var leaseAtStart = readDatabaseCacheBuildLease_();
    if (!leaseAtStart || leaseAtStart.token !== leaseToken) return false;
    buildGenerationAtStart = Number(leaseAtStart.generation);
    props = getScriptProps();
    props.setProperty("BUILD_STATUS", "RUNNING");
    props.setProperty("LAST_MODIFICATION_TIMESTAMP", new Date().toISOString());
    var buildContext = prepareDatabaseCacheBuildContext_(
      startTime, props, leaseToken, buildGenerationAtStart, callerAlreadyLocked,
    );
    buildContext.buildLeaseToken = leaseToken;
    buildContext.buildGeneration = buildGenerationAtStart;
    buildContext.callerAlreadyLocked = callerAlreadyLocked;
    if (!assertDatabaseCacheBuildCurrent_(buildContext, "after preparation")) return false;
    if (!traverseDatabaseCacheSources_(buildContext)) return false;
    // A source edit during traversal invalidates this generation. The finalizer
    // repeats this check before destructive cleanup and again during publication.
    if (!assertDatabaseCacheBuildCurrent_(buildContext, "after traversal")) return false;
    return finalizeDatabaseCacheBuild_(buildContext);
  } catch (error) {
    var staleGenerationAbort = Boolean(error && error.code === "CACHE_BUILD_STALE");
    var retryableLockAbort = Boolean(error && (
      error.code === "UUID_METADATA_LOCK_BUSY" ||
      error.code === "CACHE_BUILD_LOCK_BUSY" ||
      error.code === "CACHE_PUBLICATION_BUSY"
    ));
    var retryableBuildAbort = staleGenerationAbort || retryableLockAbort;
    LoggerService.log(
      retryableBuildAbort ? "INFO" : "ERROR",
      mrhLoggerCategoryForFunction_("buildDatabaseCache"),
      staleGenerationAbort
        ? "[buildDatabaseCache] Stale generation aborted; a fresh generation will be queued."
        : retryableLockAbort
          ? "[buildDatabaseCache] A short metadata lock was busy; the resumable build will be retried."
          : "[buildDatabaseCache] ERROR: " + (error && error.stack ? error.stack : error),
      { source: staleGenerationAbort ? "build_generation_guard" : "migrated_structured_log", sourceLine: 11552 },
      "buildDatabaseCache",
      staleGenerationAbort ? null : error,
    );
    if (props) {
      try {
        if (retryableBuildAbort) {
          // A source edit invalidating an in-flight build is expected, not a
          // failed migration. Preserve migration state and let the lease
          // cleanup queue a fresh generation.
          props.setProperty("REBUILD_PENDING_AFTER_RUN", "true");
          props.setProperty("FORCE_REBUILD", "true");
        } else {
          props.setProperty("BUILD_STATUS", "FAILED");
          props.deleteProperty("MRH_DECK_PAGE_STORAGE_MIGRATION_QUEUED");
          props.setProperty(
            "MRH_DECK_PAGE_STORAGE_MIGRATION_RETRY_AFTER",
            String(Date.now() + 300000),
          );
          props.setProperty(
            "BUILD_LAST_ERROR",
            cleanText(error && error.message ? error.message : error, 1000),
          );
        }
      } catch (stateError) {
        LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("buildDatabaseCache"), "[buildDatabaseCache] Failed to persist build failure state.", {}, "buildDatabaseCache", stateError);
      }
    }
    // For stale-generation and transient lock aborts, leave trigger reconciliation to lease cleanup;
    // clearing triggers here could erase the very resume request needed to
    // rebuild from the changed source. Real build failures keep prior behavior.
    if (!retryableBuildAbort) {
      try { clearResumeTriggers(); }
      catch (triggerError) {
        LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("buildDatabaseCache"), "[buildDatabaseCache] Failed to clear resume triggers after fatal error.", {}, "buildDatabaseCache", triggerError);
      }
    }
    return false;
  } finally {
    try { releaseDatabaseCacheBuildLease_(leaseToken, callerAlreadyLocked); }
    catch (leaseError) {
      // If lease cleanup itself fails, its expiry prevents a permanent deadlock.
      LoggerService.log("ERROR", mrhLoggerCategoryForFunction_("buildDatabaseCache"), "[buildDatabaseCache] Build lease cleanup failed; it will expire automatically.", {}, "buildDatabaseCache", leaseError);
    }
  }
}

function clearResumeTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === RESUME_TRIGGER_HANDLER)
      ScriptApp.deleteTrigger(triggers[i]);
  }
}

/* -------------------------------------------------------------------------- */
/* Full reset                                                                 */
/* -------------------------------------------------------------------------- */

function resetEverythingAndStartFresh() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(BUILDER_LOCK_TIMEOUT_MS))
    throw new Error("Another database operation is currently running.");

  var props = getScriptProps();
  try {
    // Check before bumping the source generation: a refused reset must not
    // invalidate the currently running build as an accidental side effect.
    if (isDatabaseCacheBuildLeaseActive_())
      throw new Error("A cache build is active. Retry the full reset after it finishes.");
    bumpDatabaseCacheBuildGeneration_();
    var uuidSheet = getOrInitializeUUIDSheet();
    var uuidRowsToDelete = Math.max(0, uuidSheet.getLastRow() - 1);
    if (uuidRowsToDelete > 0) {
      uuidSheet.deleteRows(2, uuidRowsToDelete);
      LoggerService.recordOperation_("spreadsheet.uuid.rowsDeleted", uuidRowsToDelete);
      LoggerService.log("WARN", "SPREADSHEET_OPS", "UUID metadata rows deleted during full reset", {
        service: "SpreadsheetApp",
        operation: "deleteRows",
        sheetName: "UUID",
        startRow: 2,
        affectedRowCount: uuidRowsToDelete,
      }, "resetEverythingAndStartFresh");
    }

    var cacheFolder = getOrCreateCacheFolder(true);
    var files = cacheFolder.getFiles();
    while (files.hasNext()) hardDeleteFile(files.next());

    var keys = props.getKeys();
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (
        key.indexOf("PERM_FILE_ID_") === 0 ||
        [
          "PERM_FOLDER_ID",
          "BUILD_CACHE_STATE",
          "FORCE_REBUILD",
          "MRH_CACHE_VERSION",
          "MRH_CACHE_VERSION_TIMESTAMP",
          "CACHE_VER",
          "BUILD_CACHE_REBUILD_INPROGRESS",
          "MRH_FILE_TIMESTAMPS",
          "MRH_FILE_SUBJECTS",
          "MRH_LEGACY_SUBJECT_MIGRATED",
          "MRH_SUBJECT_SCHEMA_VERSION",
          "MRH_DECK_PAGE_STORAGE_VERSION",
          "MRH_DECK_PAGE_STORAGE_MIGRATION_QUEUED",
          "MRH_DECK_PAGE_STORAGE_MIGRATION_RETRY_AFTER",
          "LAST_CACHE_BUILD_SUCCESS",
          "LAST_CACHE_BUILD_VERSION",
          "BUILD_STATUS",
          "BUILD_LAST_ERROR",
          "LAST_MODIFICATION_TIMESTAMP",
          "MRH_DUPLICATE_SUBJECTS",
          "MRH_EXTRACTION_WARNING_COUNT",
        ].indexOf(key) !== -1
      )
        props.deleteProperty(key);
    }

    props.setProperty("FORCE_REBUILD", "true");
    invalidateMetadataCache();
  } catch (error) {
    LoggerService.log("ERROR", "BUSINESS_LOGIC", "Full backend reset failed", {}, "resetEverythingAndStartFresh", error);
    throw new Error("Failed to reset: " + error.toString());
  } finally {
    lock.releaseLock();
  }
  var rebuilt = buildDatabaseCache();
  var version = getCacheInvalidationVersion();
  return {
    status: "success",
    message: rebuilt
      ? "All metadata and caches were reset and the database was rebuilt."
      : "All metadata and caches were reset; rebuild is pending.",
    buildCacheTriggered: rebuilt,
    cacheVersion: version,
  };
}

function mrhLoggedSpreadsheetOpenById_(spreadsheetId, purpose) {
  var safeId = mrhLoggerSafeIdentifier_(spreadsheetId);
  var startedAt = Date.now();
  try {
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    LoggerService.recordOperation_("spreadsheet.openById", 1);
    LoggerService.log("DEBUG", "SPREADSHEET_OPS", "Spreadsheet opened by ID", {
      service: "SpreadsheetApp", operation: "openById", spreadsheetId: safeId, purpose: purpose || "",
    }, mrhLoggerCurrentFunction_() || "mrhLoggedSpreadsheetOpenById_");
    return spreadsheet;
  } catch (error) {
    LoggerService.recordOperation_("spreadsheet.openById.failure", 1);
    LoggerService.log("ERROR", "SPREADSHEET_OPS", "Spreadsheet openById failed", {
      service: "SpreadsheetApp", operation: "openById", spreadsheetId: safeId, purpose: purpose || "", durationMs: Date.now() - startedAt,
    }, mrhLoggerCurrentFunction_() || "mrhLoggedSpreadsheetOpenById_", error);
    throw error;
  }
}

function mrhLoggedSpreadsheetOpen_(file, purpose) {
  var fileId = "";
  try { fileId = file && typeof file.getId === "function" ? mrhLoggerSafeIdentifier_(file.getId()) : ""; } catch (ignored) {}
  var startedAt = Date.now();
  try {
    var spreadsheet = SpreadsheetApp.open(file);
    LoggerService.recordOperation_("spreadsheet.openFile", 1);
    LoggerService.log("DEBUG", "SPREADSHEET_OPS", "Spreadsheet file opened", {
      service: "SpreadsheetApp", operation: "open", fileId: fileId, purpose: purpose || "",
    }, mrhLoggerCurrentFunction_() || "mrhLoggedSpreadsheetOpen_");
    return spreadsheet;
  } catch (error) {
    LoggerService.recordOperation_("spreadsheet.openFile.failure", 1);
    LoggerService.log("ERROR", "SPREADSHEET_OPS", "Spreadsheet file open failed", {
      service: "SpreadsheetApp", operation: "open", fileId: fileId, purpose: purpose || "", durationMs: Date.now() - startedAt,
    }, mrhLoggerCurrentFunction_() || "mrhLoggedSpreadsheetOpen_", error);
    throw error;
  }
}

function mrhLoggedDriveGetFolderById_(folderId) {
  var safeId = mrhLoggerSafeIdentifier_(folderId);
  var startedAt = Date.now();
  var functionName = mrhLoggerCurrentFunction_();
  try {
    var folder = DriveApp.getFolderById(folderId);
    LoggerService.recordOperation_("drive.folder.lookup", 1);
    LoggerService.log("DEBUG", "BUSINESS_LOGIC", "Drive folder lookup succeeded", {
      service: "DriveApp", operation: "getFolderById", folderId: safeId,
      durationMs: Date.now() - startedAt,
    }, functionName || "mrhLoggedDriveGetFolderById_");
    return folder;
  } catch (error) {
    LoggerService.recordOperation_("drive.folder.lookup.failure", 1);
    LoggerService.log("ERROR", "BUSINESS_LOGIC", "Drive folder lookup failed", {
      service: "DriveApp", operation: "getFolderById", folderId: safeId,
      durationMs: Date.now() - startedAt,
    }, functionName || "mrhLoggedDriveGetFolderById_", error);
    throw error;
  }
}

function mrhLoggedDriveGetFileById_(fileId) {
  var safeId = mrhLoggerSafeIdentifier_(fileId);
  var startedAt = Date.now();
  var functionName = mrhLoggerCurrentFunction_();
  try {
    var file = DriveApp.getFileById(fileId);
    LoggerService.recordOperation_("drive.file.lookup", 1);
    LoggerService.log("DEBUG", "BUSINESS_LOGIC", "Drive file lookup succeeded", {
      service: "DriveApp", operation: "getFileById", fileId: safeId,
      durationMs: Date.now() - startedAt,
    }, functionName || "mrhLoggedDriveGetFileById_");
    return file;
  } catch (error) {
    LoggerService.recordOperation_("drive.file.lookup.failure", 1);
    LoggerService.log("ERROR", "BUSINESS_LOGIC", "Drive file lookup failed", {
      service: "DriveApp", operation: "getFileById", fileId: safeId,
      durationMs: Date.now() - startedAt,
    }, functionName || "mrhLoggedDriveGetFileById_", error);
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* Central structured logger                                                  */
/* -------------------------------------------------------------------------- */

var MRH_LOGGER_CONTEXT_ = { executionId: "", startTime: 0, userEmail: "", userEmailResolved: false, sheetQueue: [], flushing: false, sheetDisabled: false, operationMetrics: Object.create(null) };
var MRH_LOGGER_CONFIG_CACHE_ = null;
var MRH_LOGGER_LEVEL_ORDER_ = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };
var MRH_LOGGER_MAX_TEXT_ = 1200;
var MRH_LOGGER_MAX_JSON_CHARS_ = 20000;
var MRH_LOGGER_MAX_DEPTH_ = 6;
var MRH_LOGGER_MAX_ARRAY_ITEMS_ = 40;
var MRH_LOGGER_MAX_SHEET_BUFFER_ = 500;
var MRH_LOGGER_REDACTED_ = "[REDACTED]";

function mrhLoggerSafeText_(value, limit) {
  var text = String(value === undefined || value === null ? "" : value);
  text = text
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\b(sb_secret_)[A-Za-z0-9_-]+/gi, "$1[REDACTED]")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[REDACTED_API_KEY]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]")
    .replace(/((?:access[_-]?token|id[_-]?token|refresh[_-]?token|api[_-]?key|token|password|secret|authorization|cookie|credential)\s*[:=]\s*)[^\s&,;]+/gi, "$1[REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]");
  var maximum = Number(limit || MRH_LOGGER_MAX_TEXT_);
  if (text.length > maximum) text = text.substring(0, maximum) + "…[TRUNCATED]";
  return text;
}

function mrhLoggerSafeIdentifier_(value) {
  var text = String(value === undefined || value === null ? "" : value).trim();
  if (!text) return "";
  // Google resource IDs are useful for diagnostics; reject URL/token-shaped values.
  if (/^https?:\/\//i.test(text) || /^eyJ[A-Za-z0-9_-]+\./.test(text) || /@/.test(text)) return "[REDACTED]";
  return mrhLoggerSafeText_(text, 160);
}

function mrhLoggerUtf8Length_(value) {
  var text = String(value === undefined || value === null ? "" : value);
  try {
    if (typeof Utilities !== "undefined" && Utilities && typeof Utilities.newBlob === "function")
      return Utilities.newBlob(text).getBytes().length;
  } catch (ignored) {}
  return text.length;
}

function mrhLoggerConfig_() {
  if (MRH_LOGGER_CONFIG_CACHE_) return MRH_LOGGER_CONFIG_CACHE_;
  var config = { level: "INFO", sheetEnabled: false, sheetId: "", sheetTab: "DEBUG_LOGS", sheetMinLevel: "WARN" };
  try {
    var properties = PropertiesService.getScriptProperties();
    var configuredLevel = String(properties.getProperty("MRH_LOG_LEVEL") || "INFO").trim().toUpperCase();
    if (MRH_LOGGER_LEVEL_ORDER_[configuredLevel]) config.level = configuredLevel;
    var enabledValue = String(properties.getProperty("MRH_LOG_SHEET_ENABLED") || "false").trim().toLowerCase();
    var sheetId = String(properties.getProperty("MRH_LOG_SHEET_ID") || "").trim();
    config.sheetEnabled = enabledValue === "true" && /^[A-Za-z0-9_-]{20,100}$/.test(sheetId);
    config.sheetId = config.sheetEnabled ? sheetId : "";
    var tab = String(properties.getProperty("MRH_LOG_SHEET_TAB_NAME") || "DEBUG_LOGS").trim();
    if (tab) config.sheetTab = tab.substring(0, 90);
    var sheetMin = String(properties.getProperty("MRH_LOG_SHEET_MIN_LEVEL") || "WARN").trim().toUpperCase();
    if (MRH_LOGGER_LEVEL_ORDER_[sheetMin]) config.sheetMinLevel = sheetMin;
  } catch (error) {
    // A logger configuration failure must never prevent the business operation.
  }
  MRH_LOGGER_CONFIG_CACHE_ = config;
  return config;
}

function mrhLoggerLevelAllowed_(level, minimum) {
  var normalized = String(level || "INFO").toUpperCase();
  var threshold = String(minimum || "INFO").toUpperCase();
  return (MRH_LOGGER_LEVEL_ORDER_[normalized] || 20) >= (MRH_LOGGER_LEVEL_ORDER_[threshold] || 20);
}

function mrhLoggerCurrentFunction_() {
  try {
    if (typeof MRH_TRACE_STATE_ !== "undefined" && MRH_TRACE_STATE_.functionStack && MRH_TRACE_STATE_.functionStack.length)
      return String(MRH_TRACE_STATE_.functionStack[MRH_TRACE_STATE_.functionStack.length - 1]);
  } catch (ignored) {}
  return "(unattributed)";
}

function mrhLoggerExecutionId_() {
  if (MRH_LOGGER_CONTEXT_.executionId) return MRH_LOGGER_CONTEXT_.executionId;
  try {
    if (typeof mrhTraceEnsureContext_ === "function") {
      mrhTraceEnsureContext_();
      if (typeof MRH_TRACE_STATE_ !== "undefined" && MRH_TRACE_STATE_.executionId) {
        MRH_LOGGER_CONTEXT_.executionId = String(MRH_TRACE_STATE_.executionId);
        MRH_LOGGER_CONTEXT_.startTime = Number(MRH_TRACE_STATE_.startedAt || Date.now());
        return MRH_LOGGER_CONTEXT_.executionId;
      }
    }
  } catch (ignored) {}
  try { MRH_LOGGER_CONTEXT_.executionId = String(Utilities.getUuid()); }
  catch (ignored2) { MRH_LOGGER_CONTEXT_.executionId = "exec-" + String(Date.now()) + "-" + String(Math.floor(Math.random() * 1000000)); }
  if (!MRH_LOGGER_CONTEXT_.startTime) MRH_LOGGER_CONTEXT_.startTime = Date.now();
  return MRH_LOGGER_CONTEXT_.executionId;
}

function mrhLoggerUserEmail_() {
  // PII hygiene: verify whether a user identity is available, but never emit a raw email address.
  if (MRH_LOGGER_CONTEXT_.userEmailResolved) return MRH_LOGGER_CONTEXT_.userEmail;
  MRH_LOGGER_CONTEXT_.userEmailResolved = true;
  try {
    if (typeof Session === "undefined" || !Session) return "";
    var email = "";
    if (typeof Session.getActiveUser === "function") {
      var active = Session.getActiveUser();
      email = active && typeof active.getEmail === "function" ? String(active.getEmail() || "") : "";
    }
    if (!email && typeof Session.getEffectiveUser === "function") {
      var effective = Session.getEffectiveUser();
      email = effective && typeof effective.getEmail === "function" ? String(effective.getEmail() || "") : "";
    }
    MRH_LOGGER_CONTEXT_.userEmail = email ? "[REDACTED_EMAIL]" : "";
    return MRH_LOGGER_CONTEXT_.userEmail;
  } catch (ignored) {
    MRH_LOGGER_CONTEXT_.userEmail = "";
    return "";
  }
}

function mrhLoggerSanitizeValue_(value, key, depth, seen) {
  var normalizedKey = String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (/(?:password|secret|token|authorization|cookie|credential|apikey|privatekey|sessionproof|sessionkey|email|phone|mobile|address|firstname|lastname|middlename|familyname|givenname|middleinitial|fullname|displayname|username|userid|activeuser|verifiedaccountemail|idtoken|accesskey|refreshkey|payload|postdata|requestbody|rawbody|binarycontent|birthdate|dateofbirth|ipaddress|^name$|^subject$|^user$)/i.test(normalizedKey)) {
    if (normalizedKey === "email" || /email/.test(normalizedKey)) return "[REDACTED_EMAIL]";
    return MRH_LOGGER_REDACTED_;
  }
  if (depth > MRH_LOGGER_MAX_DEPTH_) return "[MAX_DEPTH]";
  if (value === null || value === undefined) return value === null ? null : "[UNDEFINED]";
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return mrhLoggerSafeText_(value, MRH_LOGGER_MAX_TEXT_);
  if (typeof value === "function") return "[FUNCTION]";
  if (typeof value !== "object") return mrhLoggerSafeText_(String(value), 200);
  if (seen.indexOf(value) !== -1) return "[CIRCULAR]";
  seen.push(value);
  var result;
  if (Array.isArray(value)) {
    result = value.slice(0, MRH_LOGGER_MAX_ARRAY_ITEMS_).map(function (item) {
      return mrhLoggerSanitizeValue_(item, "", depth + 1, seen);
    });
    if (value.length > MRH_LOGGER_MAX_ARRAY_ITEMS_) result.push("[TRUNCATED_ARRAY length=" + value.length + "]");
  } else {
    result = {};
    Object.keys(value).slice(0, 100).forEach(function (childKey) {
      result[childKey] = mrhLoggerSanitizeValue_(value[childKey], childKey, depth + 1, seen);
    });
  }
  seen.pop();
  return result;
}

function mrhLoggerSafeUrl_(url) {
  var input = String(url || "");
  var withoutFragment = input.split("#")[0];
  var questionIndex = withoutFragment.indexOf("?");
  var base = questionIndex >= 0 ? withoutFragment.substring(0, questionIndex) : withoutFragment;
  // URLs must not expose embedded Basic-auth userinfo or provider API keys.
  base = base.replace(/(https?:\/\/)[^\/@]+@/i, "$1[REDACTED]@");
  base = base.replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[REDACTED_API_KEY]");
  // Redact sensitive named path segments and opaque/token-like values too.
  base = base.replace(/\/(api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|token|secret|password|authorization)\/[^\/]+/gi, "/$1/[REDACTED]");
  base = base.replace(/\/(?:eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|[A-Za-z0-9_-]{48,})(?=\/|$)/g, "/[REDACTED]");
  var parameterNames = [];
  if (questionIndex >= 0) {
    var query = withoutFragment.substring(questionIndex + 1).split("&");
    query.forEach(function (pair) {
      if (!pair) return;
      var rawName = pair.split("=")[0] || "";
      try { rawName = decodeURIComponent(rawName.replace(/\+/g, " ")); } catch (ignored) {}
      if (rawName && /^[A-Za-z0-9_.-]{1,60}$/.test(rawName)) parameterNames.push(rawName);
    });
  }
  return { url: mrhLoggerSafeText_(base, 500), hasQuery: questionIndex >= 0, queryParameterNames: parameterNames.slice(0, 30) };
}

function mrhLoggerCategoryForFunction_(functionName) {
  var name = String(functionName || "");
  if (/^(?:onEdit|uuidSheetEdited|scheduledDatabaseSync|setupTriggers|triggerBuildDatabaseCache|forceFullRebuildDatabaseCache|resumeBuildDatabaseCache|ensureResumeBuildTrigger|clearResumeTriggers|resetEverythingAndStartFresh|migrateDeckPasswordsToPbkdf2|resumeDeckPasswordHashMigration|runDeckPasswordHashMigrationBatch_|cleanupMRHPersistentRateLimitState|setupMRHPersistentRateLimitCleanupTrigger)$/.test(name)) return "TRIGGER";
  if (/^(?:mrhSupabaseRequest_|mrhLoggedUrlFetch_|verifyReviewerIdentityToken_|validateMRHSupabaseSchema_)$/i.test(name) || /(?:Fetch|SupabaseRequest|UrlFetch)/i.test(name)) return "API_CALL";
  if (/(?:UUIDSheet|UUIDRecords|Spreadsheet|SheetRows|Sheet|CentralLogSheet|migrateMRHSpreadsheetsToSupabase)/i.test(name)) return "SPREADSHEET_OPS";
  if (/(?:Reviewer|Password|Identity|Authorization|Access|Session|Account|SignIn|Enrollment|Auth)/i.test(name)) return "AUTH";
  return "BUSINESS_LOGIC";
}

function mrhLoggerSheetCell_(value) {
  // Use the shared formula-injection guard so ordinary writes and log writes
  // apply exactly the same leading-character protection.
  return escapeFormulaInjection_(value);
}

var LoggerService = {
  getConfiguredLevel_: function () { return mrhLoggerConfig_().level; },
  categoryForFunction_: function (functionName) { return mrhLoggerCategoryForFunction_(functionName); },
  recordOperation_: function (name, count) {
    var key = mrhLoggerSafeText_(name || "operation.unknown", 100);
    var amount = Number(count === undefined ? 1 : count);
    if (!Number.isFinite(amount) || amount < 0) amount = 1;
    if (!MRH_LOGGER_CONTEXT_.operationMetrics[key]) MRH_LOGGER_CONTEXT_.operationMetrics[key] = 0;
    MRH_LOGGER_CONTEXT_.operationMetrics[key] += amount;
  },
  getOperationMetrics_: function () {
    return Object.assign({}, MRH_LOGGER_CONTEXT_.operationMetrics || {});
  },

  log: function (level, category, message, metadata, functionName, error) {
    try {
      return this._logUnsafe_.apply(this, arguments);
    } catch (loggingError) {
      // The logger is fail-open: a logging failure must never fail the application operation.
      try {
        var fallbackRecord = {
          timestamp: new Date().toISOString(), logLevel: "ERROR", executionId: MRH_LOGGER_CONTEXT_.executionId || "unavailable",
          userEmail: "", functionName: "LoggerService.log", category: "BUSINESS_LOGIC",
          message: "Structured logger failed; original operation was allowed to continue.",
          metadata: { requestedLevel: String(level || "INFO"), requestedFunction: mrhLoggerSafeText_(functionName || "", 100) },
          errorDetails: { name: String(loggingError && loggingError.name || "Error"), message: mrhLoggerSafeText_(loggingError && loggingError.message || loggingError, 300) },
        };
        if (typeof console !== "undefined" && console && typeof console.error === "function") console.error(JSON.stringify(fallbackRecord));
        else Logger.log(JSON.stringify(fallbackRecord));
      } catch (ignored) {}
      return false;
    }
  },

  _logUnsafe_: function (level, category, message, metadata, functionName, error) {
    var normalizedLevel = String(level || "INFO").toUpperCase();
    if (!MRH_LOGGER_LEVEL_ORDER_[normalizedLevel]) normalizedLevel = "INFO";
    var config = mrhLoggerConfig_();
    if (normalizedLevel !== "ERROR" && !mrhLoggerLevelAllowed_(normalizedLevel, config.level)) return false;
    var normalizedCategory = String(category || mrhLoggerCategoryForFunction_(functionName || mrhLoggerCurrentFunction_())).toUpperCase();
    if (["TRIGGER", "API_CALL", "SPREADSHEET_OPS", "AUTH", "BUSINESS_LOGIC"].indexOf(normalizedCategory) < 0)
      normalizedCategory = mrhLoggerCategoryForFunction_(functionName || mrhLoggerCurrentFunction_());
    var errorDetails = null;
    if (error) {
      var stack = error && error.stack ? String(error.stack) : "";
      errorDetails = {
        name: mrhLoggerSafeText_(error && error.name || "Error", 100),
        message: mrhLoggerSafeText_(error && error.message || error || "Unknown error", 1500),
        stack: mrhLoggerSafeText_(stack, 12000),
      };
    }
    var record = {
      timestamp: new Date().toISOString(),
      logLevel: normalizedLevel,
      executionId: mrhLoggerExecutionId_(),
      userEmail: mrhLoggerUserEmail_(),
      functionName: mrhLoggerSafeText_(functionName || mrhLoggerCurrentFunction_(), 120),
      category: normalizedCategory,
      message: mrhLoggerSafeText_(message || "Application event", 1500),
      metadata: mrhLoggerSanitizeValue_(metadata || {}, "metadata", 0, []),
      errorDetails: errorDetails,
    };
    var serialized;
    try { serialized = JSON.stringify(record); }
    catch (serializeError) {
      record.metadata = { serializationFailure: true };
      serialized = JSON.stringify(record);
    }
    if (serialized.length > MRH_LOGGER_MAX_JSON_CHARS_) {
      record.metadata = { truncated: true, originalMetadataLength: serialized.length };
      serialized = JSON.stringify(record);
    }
    this._emitConsole_(normalizedLevel, serialized);
    this._queueSheet_(record, config);
    return true;
  },

  _emitConsole_: function (level, serialized) {
    try {
      if (typeof console !== "undefined" && console) {
        if (level === "ERROR" && typeof console.error === "function") { console.error(serialized); return; }
        if (level === "WARN" && typeof console.warn === "function") { console.warn(serialized); return; }
        if (level === "INFO" && typeof console.info === "function") { console.info(serialized); return; }
        if (level === "DEBUG" && typeof console.debug === "function") { console.debug(serialized); return; }
        // console.log maps to DEBUG in Apps Script; use it only as the fallback.
        if (typeof console.log === "function") { console.log(serialized); return; }
      }
    } catch (consoleError) {}
    try { Logger.log(serialized); } catch (ignored) {}
  },

  _queueSheet_: function (record, config) {
    if (!config.sheetEnabled || MRH_LOGGER_CONTEXT_.sheetDisabled || MRH_LOGGER_CONTEXT_.flushing) return;
    if (!mrhLoggerLevelAllowed_(record.logLevel, config.sheetMinLevel)) return;
    var queue = MRH_LOGGER_CONTEXT_.sheetQueue;
    if (queue.length >= MRH_LOGGER_MAX_SHEET_BUFFER_) {
      var dropIndex = queue.findIndex(function (item) { return item.logLevel === "DEBUG" || item.logLevel === "INFO"; });
      if (dropIndex >= 0) queue.splice(dropIndex, 1);
      else if (record.logLevel !== "ERROR") return;
      else queue.shift();
    }
    queue.push(record);
  },

  flush: function () {
    var queue = MRH_LOGGER_CONTEXT_.sheetQueue;
    if (!queue.length || MRH_LOGGER_CONTEXT_.flushing || MRH_LOGGER_CONTEXT_.sheetDisabled) return;
    var config = mrhLoggerConfig_();
    if (!config.sheetEnabled) { queue.length = 0; return; }
    MRH_LOGGER_CONTEXT_.flushing = true;
    var batch = queue.splice(0, queue.length);
    var sheetLock = null;
    var sheetLockAcquired = false;
    try {
      // Serialize append operations across concurrent Apps Script executions so
      // two flushes cannot write to the same next row.
      if (typeof LockService !== "undefined" && LockService && typeof LockService.getScriptLock === "function") {
        sheetLock = LockService.getScriptLock();
        sheetLockAcquired = sheetLock.tryLock(1500);
        if (!sheetLockAcquired) throw new Error("Could not acquire the optional log Sheet append lock.");
      }
      var spreadsheet = SpreadsheetApp.openById(config.sheetId);
      var sheet = spreadsheet.getSheetByName(config.sheetTab);
      if (!sheet) sheet = spreadsheet.insertSheet(config.sheetTab);
      var headers = ["Timestamp", "Log Level", "Execution ID", "User Email", "Function", "Category", "Message", "Metadata JSON", "Error Details JSON"];
      if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      var rows = batch.map(function (record) {
        return [
          record.timestamp,
          record.logLevel,
          record.executionId,
          record.userEmail,
          record.functionName,
          record.category,
          record.message,
          JSON.stringify(record.metadata || {}),
          record.errorDetails ? JSON.stringify(record.errorDetails) : "",
        ].map(mrhLoggerSheetCell_);
      });
      if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
    } catch (error) {
      MRH_LOGGER_CONTEXT_.sheetDisabled = true;
      this._emitConsole_("ERROR", JSON.stringify({
        timestamp: new Date().toISOString(), logLevel: "ERROR", executionId: mrhLoggerExecutionId_(),
        userEmail: mrhLoggerUserEmail_(), functionName: "LoggerService.flush", category: "SPREADSHEET_OPS",
        message: "Optional log Sheet sink failed and has been disabled for this execution.",
        metadata: {
          queuedRecordCount: batch.length,
          droppedRecordCount: batch.length,
          sheetTab: config.sheetTab,
          sinkDisabledForExecution: true,
        },
        errorDetails: { name: mrhLoggerSafeText_(error && error.name || "Error", 100), message: mrhLoggerSafeText_(error && error.message || error, 800), stack: mrhLoggerSafeText_(error && error.stack || "", 2000) },
      }));
    } finally {
      if (sheetLockAcquired && sheetLock) {
        try { sheetLock.releaseLock(); } catch (ignored) {}
      }
      MRH_LOGGER_CONTEXT_.flushing = false;
    }
  },
};

function mrhLoggerSafePayloadPreview_(text) {
  var raw = String(text || "");
  if (!raw) return "";
  try {
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return { responseType: Array.isArray(parsed) ? "array" : typeof parsed, responseBytes: mrhLoggerUtf8Length_(raw) };
    var safe = {};
    ["code", "error", "message", "details", "hint", "status", "name", "description"].forEach(function (key) {
      if (parsed[key] !== undefined && parsed[key] !== null && typeof parsed[key] !== "object")
        safe[key] = mrhLoggerSafeText_(parsed[key], 500);
    });
    safe.responseBytes = mrhLoggerUtf8Length_(raw);
    return safe;
  } catch (ignored) {
    return { responseType: "non_json", responseBytes: mrhLoggerUtf8Length_(raw), bodyOmittedForPrivacy: true };
  }
}

function mrhLoggedUrlFetch_(url, options, context) {
  var opts = options || {};
  var ctx = context && typeof context === "object" ? context : {};
  var method = String(opts.method || "get").toUpperCase();
  var payloadBytes = 0;
  if (opts.payload !== undefined && opts.payload !== null) {
    try {
      if (Array.isArray(opts.payload)) payloadBytes = opts.payload.length; // UrlFetch binary byte array.
      else if (typeof opts.payload === "string") payloadBytes = mrhLoggerUtf8Length_(opts.payload);
      else payloadBytes = mrhLoggerUtf8Length_(JSON.stringify(opts.payload));
    } catch (ignored) { payloadBytes = -1; }
  }
  var urlDetails = mrhLoggerSafeUrl_(url);
  var started = Date.now();
  LoggerService.recordOperation_("http.request", 1);
  LoggerService.log("INFO", "API_CALL", "Outbound HTTP request started", {
    provider: ctx.provider || "external_service", method: method, url: urlDetails.url,
    urlHasQuery: urlDetails.hasQuery, queryParameterNames: urlDetails.queryParameterNames,
    payloadBytes: payloadBytes, requestContext: ctx.operation || ctx.table || "",
  }, mrhLoggerCurrentFunction_() || "mrhLoggedUrlFetch_");
  try {
    var response = UrlFetchApp.fetch(url, opts);
    var latencyMs = Date.now() - started;
    var statusCode = response.getResponseCode();
    LoggerService.recordOperation_("http.response." + String(statusCode), 1);
    var responseBytes = null;
    var errorPayloadPreview = "";
    if (statusCode < 200 || statusCode >= 300) {
      try {
        var responseText = response.getContentText() || "";
        responseBytes = mrhLoggerUtf8Length_(responseText);
        errorPayloadPreview = mrhLoggerSafePayloadPreview_(responseText);
      } catch (bodyError) { errorPayloadPreview = "[RESPONSE_BODY_UNAVAILABLE]"; }
    }
    LoggerService.log(statusCode >= 500 ? "ERROR" : statusCode >= 400 ? "WARN" : "INFO", "API_CALL", "Outbound HTTP response received", {
      provider: ctx.provider || "external_service", method: method, url: urlDetails.url,
      statusCode: statusCode, latencyMs: latencyMs, responseBytes: responseBytes,
      requestContext: ctx.operation || ctx.table || "", responseErrorSummary: errorPayloadPreview || undefined,
    }, mrhLoggerCurrentFunction_() || "mrhLoggedUrlFetch_");
    return response;
  } catch (error) {
    LoggerService.recordOperation_("http.exception", 1);
    LoggerService.log("ERROR", "API_CALL", "Outbound HTTP request threw an exception", {
      provider: ctx.provider || "external_service", method: method, url: urlDetails.url,
      payloadBytes: payloadBytes, latencyMs: Date.now() - started,
      requestContext: ctx.operation || ctx.table || "",
    }, mrhLoggerCurrentFunction_() || "mrhLoggedUrlFetch_", error);
    throw error;
  }
}

function mrhTraceCategoryForFunction_(functionName) {
  return mrhLoggerCategoryForFunction_(functionName);
}

function mrhTraceMajorFunction_(functionName) {
  return MRH_TRACE_MAJOR_FUNCTIONS_.indexOf(String(functionName || "")) !== -1;
}

// Detailed function tracing is disabled by default in production. Set the
// Script Property MRH_TRACE_ENABLED=true to enable a full trace for an execution.
// The static flag is an emergency source-level override for development only.
var MRH_TRACE_ENABLED_ = false;
var MRH_TRACE_EVERY_HOT_CALL_ = false;
var MRH_TRACE_SLOW_CALL_MS_ = 100;
var MRH_TRACE_MAX_TEXT_ = 240;
var MRH_TRACE_STATE_ = {
  executionId: "",
  startedAt: 0,
  depth: 0,
  functionStack: [],
  wrapped: false,
  wrappedAll: false,
  traceEnabled: null,
  wrappedCount: 0,
  installSummary: null,
  installationEventEmitted: false,
  hotMetrics: Object.create(null),
  functionMetrics: Object.create(null),
};

// Functions with high call volume. Their calls are counted and timed, rather than logged one by
// one, unless MRH_TRACE_EVERY_HOT_CALL_ is explicitly enabled.
var MRH_TRACE_HOT_FUNCTIONS_ = [
  "cleanText",
  "sheetCellText",
  "safeCellText",
  "normalizeSubjectFromPath",
  "normalizeSubject",
  "toBoolean",
  "sha256Hex",
  "constantTimeEqual",
  "isLegacyPasswordHash",
  "isIteratedPasswordHash",
  "isPrivateResourceFolderName",
  "getSourceKey",
  "compareSubjectHierarchy",
  "getEffectivePassword",
  "isSubjectHiddenByHierarchy",
  "answerTokenToIndex",
  "detectAnswerIndex",
  "normalizeSheetColor",
  "isPbkdf2PasswordHash",
  "isLegacyPasswordHashFormat_",
  "isWrappedLegacyPasswordHash_",
  "parseWrappedLegacyPasswordHash_",
  "normalizePasswordForStorage_",
  "escapeFormulaInjection_",
  "sanitizeCentralLogText_",
  "sanitizeCentralLogValue_",
  "safeCentralLogPayload_",
  "mrhSupabaseRows_",
  "encodeMRHSupabaseFilterValue_",
  "getReviewerSessionPropertyKey_",
  "parseMRHLegacyTimestamp_",
  "getMRHLegacyField_",
  "getMRHLegacyLogDateTime_",
  "getCentralLogRequestType_",
  "getCentralLogTabName_",
  "getCentralLogSummary_",
  "getCentralLogResponseStatus_",
  "getCentralLogErrorCode_",
  "formatCentralWebAppLogDateTime_",
  "isCriticalCentralWebAppLogEvent_",
  "shouldPersistCentralWebAppLogToSheet_",
  "mrhLoggerSafeText_",
  "mrhLoggerSafeIdentifier_",
  "mrhLoggerUtf8Length_",
  "mrhLoggerSanitizeValue_",
  "mrhLoggerSafeUrl_",
  "mrhLoggerLevelAllowed_",
  "mrhTraceNow_",
  "mrhTraceSafeText_",
  "mrhTraceObjectShape_",
  "mrhTraceArgsSummary_",
  "mrhTraceResultSummary_",
  "mrhTraceErrorInfo_",
  "mrhTraceCategoryForFunction_",
  "mrhTraceMajorFunction_",
  "mrhTraceEmit_",
  "mrhTraceRecordHotMetric_",
  "mrhTraceRecordFunctionMetric_",
  "mrhTraceFlushFunctionMetrics_",
  "mrhTraceFlushHotMetrics_",
  "ensureDeckUUID",
  "hardDeleteFile",
  "updateOrCreateCacheFile",
  "findCacheFilesByName",
  "writeDeckPageFiles_",
  "deleteDeckPageStorageFiles_",
  "getResourceFolderBreadcrumbs",
  "getResourceFileBreadcrumbs",
  "pbkdf2HmacSha256Hex_",
  "verifyDeckPassword_",
  "upgradeDeckPasswordHash_",
];

// Public entry points, request handlers, build orchestration, data access, and helper functions.
// The list is explicit to avoid wrapping Apps Script services or built-in functions.
var MRH_TRACE_FUNCTIONS_ = [
  "validateMRHSupabaseSchema_",
  "getMRHSupabaseConfig_",
  "getMRHSupabaseConfigUncached_",
  "mrhSupabaseRequest_",
  "mrhSupabaseRows_",
  "mrhSupabaseSelect_",
  "encodeMRHSupabaseFilterValue_",
  "mrhSupabaseUpsertBatch_",
  "mrhSupabaseImportAccountsIfMissing_",
  "scheduledDatabaseSync",
  "jsonResponse",
  "errorResponse",
  "createBackendCorrelationId_",
  "logBackendFailure_",
  "sanitizeCentralLogText_",
  "escapeFormulaInjection_",
  "getCentralLogActiveUser_",
  "sanitizeCentralLogValue_",
  "safeCentralLogPayload_",
  "logStudentPortalActivity_",
  "writeCentralWebAppLog_",
  "isCriticalCentralWebAppLogEvent_",
  "shouldPersistCentralWebAppLogToSheet_",
  "getMRHConfiguredResourceId_",
  "getMRHRootFolderId_",
  "getMRHDatabaseFolderId_",
  "getMRHUuidSpreadsheetId_",
  "getCentralLogRequestType_",
  "getCentralLogTabName_",
  "getCentralLogSummary_",
  "formatCentralWebAppLogDateTime_",
  "initializeCentralWebAppLogSheet",
  "getCentralLogResponseStatus_",
  "getCentralLogErrorCode_",
  "logWebAppRequest_",
  "executeLoggedWebAppRequest_",
  "logBackendContention_",
  "getResourcePortalRootFolderId_",
  "getResourceDashboardIndexFolderId_",
  "getResourceDashboardFileId",
  "getResourceDashboardCombinedIndex",
  "getResourceDashboardExportUrl",
  "getResourceDashboardExportMimeType",
  "buildResourceDashboardTab",
  "handleGetResourceDashboardRequest",
  "getReviewerAuthorizationConfig_",
  "getReviewerAuthorizationConfigUncached_",
  "handleGetReviewerAuthorizationConfigRequest",
  "initializeMRHAccountsSpreadsheet",
  "normalizeMRHAccountStatus_",
  "mapSupabaseMRHAccount_",
  "findMRHAccount_",
  "cacheMRHAccountResult_",
  "invalidateMRHAccountCache_",
  "refreshMRHAccountActivityCache_",
  "getMRHAccountCacheGeneration_",
  "invalidateMRHAccountCacheAll_",
  "mrhAccountsEdited",
  "writeMRHAccountFields_",
  "setupReviewerAccessRequestNotifications",
  "processReviewerAccessRequestNotifications",
  "getMRHLocalDateTime_",
  "updateMRHAccountActivity_",
  "getOrCreateReviewerPdfIssuanceReference_",
  "getOrCreateReviewerPdfIssuanceReferenceInternal_",
  "normalizeMRHLogTerm_",
  "appendMRHAccessLog_",
  "verifyReviewerIdentityToken_",
  "getVerifiedGooglePicture_",
  "getReviewerAccountStatusResponse_",
  "hasCompleteReviewerProfile_",
  "verifyReviewerRequestIdentity_",
  "getReviewerSessionPropertyKey_",
  "isValidReviewerSessionRecord_",
  "isValidReviewerSessionPublicKey_",
  "verifyReviewerSessionProof_",
  "cleanupExpiredReviewerSessionProperties_",
  "cleanupExpiredReviewerSessionProperties",
  "createReviewerSession_",
  "verifyReviewerSession_",
  "getReviewerSignOutAuditPropertyKey_",
  "setReviewerPendingAuditProperty_",
  "validateReviewerSignOutAuditRecord_",
  "stageReviewerSignOutAudit_",
  "readReviewerSignOutAudit_",
  "flushReviewerSignOutAudit_",
  "reviewerAuditEventExists_",
  "recoverPendingReviewerSignOutAudits_",
  "revokeReviewerSession_",
  "recordReviewerSignInAudit_",
  "handleReviewerSignInRequest",
  "handleLogReviewerSignInRequest",
  "handleRestoreReviewerSessionRequest",
  "handleRevokeReviewerSessionRequest",
  "handleGetReviewerAccountStatusRequest",
  "authorizeReviewerRequest_",
  "authorizeReviewerPdfRequest_",
  "getReviewerEnrollmentAuditPropertyKey_",
  "getPendingReviewerEnrollmentAuditRecords_",
  "sameReviewerEnrollmentProfile_",
  "flushReviewerEnrollmentAudit_",
  "handleReviewerEnrollmentRequest",
  "handleGetReviewerDashboardRequest",
  "protectReviewerDashboardTab_",
  "getReviewerPdfIndexFileMetadata_",
  "getReviewerPdfIndexEntries_",
  "listReviewerPdfPermissions_",
  "getReviewerPdfDriveResource_",
  "getReviewerPdfDriveHierarchy_",
  "getReviewerPdfSource_",
  "reviewerPdfSourceVersion_",
  "sumReviewerPdfTimings_",
  "reportReviewerPdfTimingFailure_",
  "logReviewerPdfRequestTiming_",
  "logReviewerPdfActivity_",
  "recordReviewerPdfUnauthorizedResourceAttempt_",
  "reviewerPdfFailure_",
  "reviewerPdfDownloadName_",
  "createReviewerPdfIssuanceReference_",
  "hasReviewerPdfSignature_",
  "checkReviewerPdfIssuanceLimit_",
  "checkReviewerPdfIssuanceLimitInternal_",
  "handleGetReviewerPdfPreviewRequest_",
  "handleGetReviewerPdfPreviewRequestCore_",
  "processReviewerPdfQueue",
  "auditReviewerPdfDrivePermissions",
  "applyReviewedReviewerPdfPermissionRevocations",
  "handleLogModuleAccessRequest",
  "handleLogResourceFileClickRequest",
  "handleLogResourceDashboardActionRequest",
  "handleBatchLogResourceEventsRequest",
  "isPrivateResourceFolderName",
  "getResourceFolderBreadcrumbs",
  "getResourceListingCacheKey",
  "isValidCachedResourceListing_",
  "handleListPublicResourcesRequest",
  "getResourceFileBreadcrumbs",
  "isIndexedReviewerPdfResource_",
  "handleGetResourcePreviewRequest",
  "isSupportedClientVersion",
  "clientVersionRequired",
  "cleanText",
  "extractResourceCourseName_",
  "sheetCellText",
  "safeCellText",
  "toBoolean",
  "normalizeSubjectFromPath",
  "normalizeSubject",
  "buildSpreadsheetSubject",
  "compareSubjectHierarchy",
  "invalidateMetadataCache",
  "invalidatePersistentMetadataCache_",
  "getScriptProps",
  "sha256Hex",
  "hashPasswordWithSalt",
  "hashLegacyPasswordWithSalt_",
  "isPbkdf2PasswordHash",
  "isLegacyPasswordHash",
  "isIteratedPasswordHash",
  "isLegacyPasswordHashFormat_",
  "parseWrappedLegacyPasswordHash_",
  "isWrappedLegacyPasswordHash_",
  "wrapLegacyPasswordHash_",
  "looksLikeUnsupportedPasswordHash_",
  "normalizePasswordForStorage_",
  "normalizeStoredPassword",
  "passwordMatches",
  "verifyDeckPassword_",
  "constantTimeEqual",
  "getCacheInvalidationVersion",
  "setCacheVersionProperties",
  "getLastModificationTimestamp",
  "generateCacheKey",
  "getDeckSyncSummaryCacheKey_",
  "buildDeckCacheKey",
  "cachePutChunked",
  "cacheGetChunked",
  "getOrInitializeUUIDSheet",
  "generateDeckUUID",
  "readUUIDRecords",
  "writeUUIDRecords",
  "normalizeUUIDSheetParentSubjects",
  "restoreMissingUUIDMetadataFromBackup_",
  "writeUUIDMetadataBackup_",
  "loadDeckMetadataMap",
  "getDeckMetadata",
  "getEffectivePassword",
  "isSubjectHiddenByHierarchy",
  "ensureDeckUUID",
  "generateDeckFileName",
  "generateUniqueDeckUUID_",
  "normalizeMetadataRecordUUIDs",
  "migrateDeckMetadataIdsToSixDigits_",
  "getSourceKey",
  "dedupeLiveSubjects",
  "recordDuplicateSubjectWarning",
  "reconcileMetadataToLiveSources",
  "analyzeQuestionTypes",
  "hasUsableExplanation",
  "buildSummaryArrayFromAccessState",
  "encodeSummaryDictionary",
  "decodeSummaryDictionary",
  "getOrCreateCacheFolder",
  "findCacheFilesByName",
  "readPersistentSummaryContent",
  "updateOrCreateCacheFile",
  "hardDeleteFile",
  "readPersistentFileIndex",
  "writePersistentFileIndex",
  "normalizeSheetColor",
  "detectAnswerIndex",
  "answerTokenToIndex",
  "extractQuestionsOptimized",
  "encodeDeckQuestions",
  "getDeckPageManifestFileName_",
  "getDeckPageStorageFileName_",
  "getLegacyDeckPageManifestFileName_",
  "getLegacyDeckPageStorageFileName_",
  "readDeckPageManifest_",
  "deleteDeckPageStorageFiles_",
  "writeDeckPageFiles_",
  "removeDeckPageFiles_",
  "getDeckJsonContent",
  "parseDeckPagination_",
  "sliceDeckJsonPage_",
  "getDeckContent_",
  "queueDeckPageStorageMigration_",
  "getDeckPayloadVersion_",
  "getDeckPageFromFiles_",
  "getPasswordRateLimitKey_",
  "checkPasswordRateLimit",
  "isPasswordRateLimited",
  "handleGetDeckRequest",
  "handleVerifyAccessRequest",
  "parseMRHLegacyTimestamp_",
  "getMRHLegacySheetRows_",
  "getMRHLegacyField_",
  "getMRHLegacyLogDateTime_",
  "migrateMRHSpreadsheetsToSupabase",
  "doGet",
  "handleGetRequest_",
  "doGetInternal",
  "createDeckSyncPendingResponse_",
  "isAccessFilteredSummaryDictionary_",
  "handleDeckSyncSnapshot_",
  "filterSummaryDictionaryByAccess_",
  "filterSummaryDataByAccess",
  "utf8ByteLength_",
  "validateBackendPostRequest_",
  "doPost",
  "doPostInternal_",
  "handleSyncStatus",
  "onEdit",
  "getUUIDSheetEditContext_",
  "refreshDeckSyncAfterMetadataEdit_",
  "uuidSheetEdited",
  "setupTriggers",
  "triggerBuildDatabaseCache",
  "forceFullRebuildDatabaseCache",
  "resumeBuildDatabaseCache",
  "ensureResumeBuildTrigger",
  "getBuildStateFile",
  "readBuildState",
  "compactBuildStateBeforeWrite_",
  "writeBuildState",
  "deleteBuildStateFile",
  "isValidBuildState",
  "buildDatabaseCache",
  "prepareDatabaseCacheBuildContext_",
  "traverseDatabaseCacheSources_",
  "finalizeDatabaseCacheBuild_",
  "clearResumeTriggers",
  "resetEverythingAndStartFresh",
  "migrateDeckPasswordsToPbkdf2",
  "resumeDeckPasswordHashMigration",
  "runDeckPasswordHashMigrationBatch_",
  "cleanupMRHPersistentRateLimitState",
  "setupMRHPersistentRateLimitCleanupTrigger",
];

var MRH_TRACE_MAJOR_FUNCTIONS_ = [
  "doGet",
  "doPost",
  "handleGetRequest_",
  "doGetInternal",
  "doPostInternal_",
  "executeLoggedWebAppRequest_",
  "scheduledDatabaseSync",
  "onEdit",
  "uuidSheetEdited",
  "getUUIDSheetEditContext_",
  "setupTriggers",
  "triggerBuildDatabaseCache",
  "forceFullRebuildDatabaseCache",
  "resumeBuildDatabaseCache",
  "ensureResumeBuildTrigger",
  "buildDatabaseCache",
  "prepareDatabaseCacheBuildContext_",
  "traverseDatabaseCacheSources_",
  "finalizeDatabaseCacheBuild_",
  "resetEverythingAndStartFresh",
  "mrhSupabaseRequest_",
  "validateMRHSupabaseSchema_",
  "migrateMRHSpreadsheetsToSupabase",
  "getOrInitializeUUIDSheet",
  "readUUIDRecords",
  "writeUUIDRecords",
  "normalizeUUIDSheetParentSubjects",
  "getOrCreateCacheFolder",
  "writePersistentFileIndex",
  "getReviewerPdfDriveResource_",
  "getReviewerPdfDriveHierarchy_",
  "handleGetReviewerPdfPreviewRequest_",
  "logWebAppRequest_",
  "writeCentralWebAppLog_",
  "appendSupabaseWebsiteLog_",
  "logBackendFailure_",
  "logReviewerPdfRequestTiming_",
  "logReviewerPdfActivity_",
  "verifyReviewerIdentityToken_",
  "initializeCentralWebAppLogSheet",
  "handleGetResourcePreviewRequest",
  "handleListPublicResourcesRequest",
  "handleGetDeckRequest",
  "handleVerifyAccessRequest",
  "handleSyncStatus",
  "getResourceDashboardCombinedIndex",
  "buildResourceDashboardTab",
  "getResourceDashboardFileId",
  "extractQuestionsOptimized",
  "handleGetResourceDashboardRequest",
  "handleGetReviewerAuthorizationConfigRequest",
  "handleReviewerSignInRequest",
  "handleLogReviewerSignInRequest",
  "handleRestoreReviewerSessionRequest",
  "handleRevokeReviewerSessionRequest",
  "handleGetReviewerAccountStatusRequest",
  "handleReviewerEnrollmentRequest",
  "handleGetReviewerDashboardRequest",
  "handleGetReviewerPdfPreviewRequestCore_",
  "handleLogModuleAccessRequest",
  "handleLogResourceFileClickRequest",
  "handleLogResourceDashboardActionRequest",
  "handleBatchLogResourceEventsRequest",
  "getDeckJsonContent",
  "handleDeckSyncSnapshot_",
  "writeBuildState",
  "readBuildState",
  "deleteBuildStateFile",
  "getBuildStateFile",
  "readPersistentSummaryContent",
  "readPersistentFileIndex",
  "getReviewerPdfIndexEntries_",
  "migrateDeckPasswordsToPbkdf2",
  "resumeDeckPasswordHashMigration",
  "cleanupMRHPersistentRateLimitState",
  "setupMRHPersistentRateLimitCleanupTrigger",
];

function mrhTraceIsEnabled_() {
  if (MRH_TRACE_ENABLED_) return true;
  if (MRH_TRACE_STATE_.traceEnabled !== null)
    return MRH_TRACE_STATE_.traceEnabled === true;
  try {
    MRH_TRACE_STATE_.traceEnabled = String(
      PropertiesService.getScriptProperties().getProperty("MRH_TRACE_ENABLED") || "false",
    ).trim().toLowerCase() === "true";
  } catch (error) {
    MRH_TRACE_STATE_.traceEnabled = false;
  }
  return MRH_TRACE_STATE_.traceEnabled;
}

function mrhTraceNow_() {
  return new Date().toISOString();
}

function mrhTraceEnsureContext_() {
  if (!MRH_TRACE_STATE_.executionId) {
    try {
      MRH_TRACE_STATE_.executionId = Utilities.getUuid();
    } catch (ignored) {
      MRH_TRACE_STATE_.executionId = "exec-" + String(Date.now());
    }
    MRH_TRACE_STATE_.startedAt = Date.now();
  }
}

function mrhTraceEmit_(eventName, functionName, fields) {
  if (!mrhTraceIsEnabled_()) return;
  mrhTraceEnsureContext_();
  var event = String(eventName || "EVENT");
  var fn = String(functionName || "(bootstrap)");
  var eventFields = fields && typeof fields === "object" ? fields : {};
  var level = "DEBUG";
  var message = "Function instrumentation event";
  if (event === "THROW") { level = "ERROR"; message = "Function threw an exception"; }
  else if (event === "SLOW_HOT_FUNCTION") { level = "WARN"; message = "High-volume helper exceeded the slow-call threshold"; }
  else if (event === "ENTER") { level = mrhTraceMajorFunction_(fn) ? "INFO" : "DEBUG"; message = "Function execution started"; }
  else if (event === "EXIT") { level = mrhTraceMajorFunction_(fn) ? "INFO" : "DEBUG"; message = "Function execution completed"; }
  else if (event === "EXECUTION_SCOPE_END") { level = "INFO"; message = "Execution scope completed"; }
  else if (event === "LOGGER_INSTALLED") { level = "INFO"; message = "Execution logging installed"; }
  else if (event === "FUNCTION_METRICS") { level = "DEBUG"; message = "Function performance metrics summary"; }
  else if (event === "HOT_FUNCTION_METRICS") { level = "DEBUG"; message = "High-volume helper performance metrics summary"; }
  else if (event === "INSTALL_FAILED") { level = "ERROR"; message = "Execution logger installation failed"; }

  var metadata = {
    event: event,
    elapsedMs: Math.max(0, Date.now() - MRH_TRACE_STATE_.startedAt),
    depth: MRH_TRACE_STATE_.depth,
  };
  Object.keys(eventFields).forEach(function (key) {
    if (["errorName", "errorMessage", "stack"].indexOf(key) === -1 || event !== "THROW")
      metadata[key] = eventFields[key];
  });
  var errorDetails = event === "THROW" ? {
    name: eventFields.errorName || "Error",
    message: eventFields.errorMessage || "Unknown error",
    stack: eventFields.stack || "",
  } : null;
  LoggerService.log(level, mrhTraceCategoryForFunction_(fn), message, metadata, fn, errorDetails);
}

function mrhTraceSafeText_(value, limit) {
  var text = String(value == null ? "" : value);
  var max = Number(limit || MRH_TRACE_MAX_TEXT_);
  if (text.length > max) text = text.substring(0, max) + "…";
  return text;
}

function mrhTraceObjectShape_(value) {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) return { type: "array", length: value.length };
  if (typeof value !== "object") return { type: typeof value };
  var keys = Object.keys(value);
  var safeKeys = keys.filter(function (key) {
    return !/(password|secret|token|authorization|cookie|body|contents|payload|question|explanation|image|data|hash)/i.test(key);
  });
  return {
    type: "object",
    keyCount: keys.length,
    keys: safeKeys.slice(0, 12),
    moreKeys: Math.max(0, safeKeys.length - 12),
  };
}

function mrhTraceArgsSummary_(functionName, argsLike) {
  var args = Array.prototype.slice.call(argsLike || []);
  var summary = { argCount: args.length, args: [] };

  // Function-specific safe diagnostics. Secret-like values and content are never emitted.
  if (functionName === "errorResponse") {
    var errorDetails = args[2] && typeof args[2] === "object" ? args[2] : {};
    summary.response = {
      code: mrhTraceSafeText_(args[1] || "ERROR", 80),
      messageLength: typeof args[0] === "string" ? args[0].length : 0,
      detailKeys: Object.keys(errorDetails).filter(function (key) {
        return !/(password|secret|token|authorization|cookie|body|contents|payload|data)/i.test(key);
      }).slice(0, 12),
    };
    return summary;
  }
  if (functionName === "jsonResponse") {
    var responsePayload = args[0] && typeof args[0] === "object" ? args[0] : {};
    summary.response = {
      status: mrhTraceSafeText_(responsePayload.status || "", 40),
      code: mrhTraceSafeText_(responsePayload.code || "", 80),
      notModified: responsePayload.notModified === true,
      isColdStart: responsePayload.isColdStart === true,
      buildStatus: mrhTraceSafeText_(responsePayload.buildStatus || "", 40),
      hasSummary: responsePayload.hasSummary === true,
      payloadSchemaVersion: responsePayload.payloadSchemaVersion == null ? null : responsePayload.payloadSchemaVersion,
      subjectCount: Array.isArray(responsePayload.subjects) ? responsePayload.subjects.length : null,
      tabNames: responsePayload.tabs && typeof responsePayload.tabs === "object" ? Object.keys(responsePayload.tabs).slice(0, 10) : [],
    };
    return summary;
  }
  if (functionName === "doPost") {
    var event = args[0] || {};
    var body = event.postData && event.postData.contents;
    var requestType = "";
    var appVersion = "";
    if (typeof body === "string") {
      try {
        var parsedBody = JSON.parse(body);
        requestType = mrhTraceSafeText_(parsedBody && parsedBody.type || "", 60);
        appVersion = mrhTraceSafeText_(parsedBody && parsedBody.appVersion || "", 60);
      } catch (ignored) {}
    }
    summary.request = {
      hasPostData: !!event.postData,
      bodyLength: typeof body === "string" ? body.length : 0,
      requestType: requestType || "(unparsed/unknown)",
      appVersion: appVersion || "(missing)",
    };
    return summary;
  }
  if (functionName === "onEdit" || functionName === "uuidSheetEdited" || functionName === "getUUIDSheetEditContext_") {
    var editEvent = args[0] || {};
    summary.triggerEvent = {
      hasSource: !!editEvent.source,
      hasRange: !!editEvent.range,
      triggerUid: editEvent.triggerUid ? mrhTraceSafeText_(editEvent.triggerUid, 80) : "",
      changeType: editEvent.changeType ? mrhTraceSafeText_(editEvent.changeType, 40) : "",
    };
    return summary;
  }
  if (functionName === "getReviewerPdfDriveResource_" || functionName === "getReviewerPdfDriveHierarchy_") {
    summary.resource = { fileId: mrhLoggerSafeIdentifier_(args[0] || ""), hasTimings: !!args[1] };
    return summary;
  }
  if (functionName === "doGet" || functionName === "doGetInternal") {
    var getEvent = args[0] || {};
    var params = getEvent.parameter || {};
    summary.request = {
      parameterNames: Object.keys(params).filter(function (key) {
        return !/(password|token|secret|auth|body|data)/i.test(key);
      }).slice(0, 20),
      hasSubject: !!params.subject,
      hasVersion: !!(params.v || params.appVersion),
      syncRequested: String(params.sync || "") === "1",
    };
    if (params.subject) summary.request.subjectLength = String(params.subject).length;
    return summary;
  }
  if (functionName === "handleGetDeckRequest" || functionName === "handleVerifyAccessRequest") {
    var accessData = args[0] || {};
    summary.request = {
      subjectLength: String(accessData.subject || "").length,
      hasPassword: accessData.password !== undefined && accessData.password !== null,
      type: mrhTraceSafeText_(accessData.type || "", 40),
    };
    return summary;
  }
  if (functionName === "handleListPublicResourcesRequest") {
    var listingData = args[0] || {};
    summary.request = {
      hasFolderId: !!listingData.folderId,
      folderIdLength: String(listingData.folderId || "").length,
    };
    return summary;
  }
  if (functionName === "handleGetResourcePreviewRequest") {
    var previewData = args[0] || {};
    summary.request = {
      hasFileId: !!previewData.fileId,
      fileIdLength: String(previewData.fileId || "").length,
    };
    return summary;
  }
  if (functionName === "handleGetResourceDashboardRequest") {
    summary.request = { hasCachedVersion: !!args[0] };
    return summary;
  }
  if (functionName === "buildDatabaseCache" || functionName === "getOrCreateCacheFolder") {
    summary.options = { alreadyLocked: !!args[0] };
    return summary;
  }
  if (functionName === "extractQuestionsOptimized") {
    // The subject already identifies the source. Do not call extra Sheets service methods just
    // for logging, since that would add API latency to large builds.
    summary.subject = mrhTraceSafeText_(args[1] || "", 120);
    summary.warningCountBefore = Array.isArray(args[2]) ? args[2].length : null;
    return summary;
  }
  if (functionName === "buildResourceDashboardTab") {
    summary.tabName = mrhTraceSafeText_(args[0] || "", 40);
    summary.indexShape = mrhTraceObjectShape_(args[1]);
    return summary;
  }
  if (functionName === "findCacheFilesByName") {
    summary.fileName = mrhTraceSafeText_(args[1] || "", 120);
    return summary;
  }
  if (functionName === "updateOrCreateCacheFile") {
    summary.fileName = mrhTraceSafeText_(args[1] || "", 120);
    summary.contentLength = typeof args[2] === "string" ? args[2].length : null;
    return summary;
  }
  if (functionName === "writeUUIDRecords") {
    summary.recordCount = Array.isArray(args[0]) ? args[0].length : null;
    return summary;
  }
  if (functionName === "reconcileMetadataToLiveSources") {
    summary.liveSourceCount = Array.isArray(args[0]) ? args[0].length : null;
    return summary;
  }
  if (functionName === "writePersistentFileIndex") {
    summary.timestampCount = args[1] && typeof args[1] === "object" ? Object.keys(args[1]).length : null;
    summary.metadataCount = args[2] && typeof args[2] === "object" ? Object.keys(args[2]).length : null;
    return summary;
  }
  if (functionName === "buildSummaryArrayFromAccessState") {
    var state = args[0] || {};
    summary.state = {
      summarySubjectCount: state.summaryMap && typeof state.summaryMap === "object" ? Object.keys(state.summaryMap).length : null,
      questionTypeCount: state.questionTypes && typeof state.questionTypes === "object" ? Object.keys(state.questionTypes).length : null,
    };
    return summary;
  }
  if (functionName === "filterSummaryDataByAccess") {
    summary.inputLength = typeof args[0] === "string" ? args[0].length : null;
    return summary;
  }
  if (functionName === "buildSpreadsheetSubject") {
    summary.pathPrefix = mrhTraceSafeText_(args[0] || "", 100);
    summary.fileName = mrhTraceSafeText_(args[1] || "", 100);
    summary.sheetName = mrhTraceSafeText_(args[2] || "", 100);
    summary.isSingleSheet = !!args[3];
    return summary;
  }

  args.forEach(function (arg, index) {
    var item = { index: index };
    if (arg === null) {
      item.type = "null";
    } else if (Array.isArray(arg)) {
      item.type = "array";
      item.length = arg.length;
    } else if (typeof arg === "string") {
      item.type = "string";
      item.length = arg.length;
    } else if (typeof arg === "number" || typeof arg === "boolean") {
      item.type = typeof arg;
      item.value = arg;
    } else if (typeof arg === "object") {
      var shape = mrhTraceObjectShape_(arg);
      item.type = shape.type;
      item.keyCount = shape.keyCount;
      item.keys = shape.keys;
      if (shape.length !== undefined) item.length = shape.length;
    } else {
      item.type = typeof arg;
    }
    summary.args.push(item);
  });
  return summary;
}

function mrhTraceResultSummary_(value) {
  if (value === null) return { resultType: "null" };
  if (value === undefined) return { resultType: "undefined" };
  if (typeof value === "boolean" || typeof value === "number") {
    return { resultType: typeof value, result: value };
  }
  if (typeof value === "string") {
    return { resultType: "string", resultLength: value.length };
  }
  if (Array.isArray(value)) return { resultType: "array", resultCount: value.length };
  if (typeof value === "object") {
    var shape = mrhTraceObjectShape_(value);
    return {
      resultType: "object",
      resultKeyCount: shape.keyCount,
      resultKeys: shape.keys,
      resultLength: shape.length,
    };
  }
  return { resultType: typeof value };
}

function mrhTraceErrorInfo_(error) {
  var message = error && error.message ? String(error.message) : String(error || "Unknown error");
  message = message.replace(/(password|secret|token|authorization|cookie)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]");
  var stack = error && error.stack ? String(error.stack) : "";
  return {
    errorName: error && error.name ? String(error.name) : "Error",
    errorMessage: mrhTraceSafeText_(message, 800),
    stack: mrhTraceSafeText_(stack, 12000),
  };
}

function mrhTraceRecordHotMetric_(functionName, elapsedMs, didFail) {
  var metric = MRH_TRACE_STATE_.hotMetrics[functionName];
  if (!metric) {
    metric = MRH_TRACE_STATE_.hotMetrics[functionName] = {
      calls: 0,
      totalMs: 0,
      maxMs: 0,
      failures: 0,
      slowCalls: 0,
    };
  }
  metric.calls += 1;
  metric.totalMs += elapsedMs;
  metric.maxMs = Math.max(metric.maxMs, elapsedMs);
  if (didFail) metric.failures += 1;
  if (elapsedMs >= MRH_TRACE_SLOW_CALL_MS_) metric.slowCalls += 1;
}

function mrhTraceRecordFunctionMetric_(functionName, elapsedMs, didFail) {
  var metric = MRH_TRACE_STATE_.functionMetrics[functionName];
  if (!metric) {
    metric = MRH_TRACE_STATE_.functionMetrics[functionName] = {
      calls: 0,
      totalMs: 0,
      maxMs: 0,
      failures: 0,
      slowCalls: 0,
    };
  }
  metric.calls += 1;
  metric.totalMs += elapsedMs;
  metric.maxMs = Math.max(metric.maxMs, elapsedMs);
  if (didFail) metric.failures += 1;
  if (elapsedMs >= MRH_TRACE_SLOW_CALL_MS_) metric.slowCalls += 1;
}

function mrhTraceFlushFunctionMetrics_() {
  var metrics = MRH_TRACE_STATE_.functionMetrics;
  var names = Object.keys(metrics);
  if (!names.length) return;
  names.sort(function (a, b) { return metrics[b].maxMs - metrics[a].maxMs; });
  var slowest = names.slice(0, 10).map(function (name) {
    var m = metrics[name];
    return { functionName: name, calls: m.calls, avgMs: Math.round((m.totalMs / Math.max(1, m.calls)) * 100) / 100,
      maxMs: m.maxMs, failures: m.failures, slowCalls: m.slowCalls };
  });
  mrhTraceEmit_("FUNCTION_METRICS", "(aggregate)", { functionCount: names.length, slowestFunctions: slowest });
  MRH_TRACE_STATE_.functionMetrics = Object.create(null);
}

function mrhTraceFlushHotMetrics_() {
  var metrics = MRH_TRACE_STATE_.hotMetrics;
  var names = Object.keys(metrics);
  if (!names.length) return;
  names.sort(function (a, b) { return metrics[b].maxMs - metrics[a].maxMs; });
  var slowest = names.slice(0, 10).map(function (name) {
    var m = metrics[name];
    return { functionName: name, calls: m.calls, avgMs: Math.round((m.totalMs / Math.max(1, m.calls)) * 100) / 100,
      maxMs: m.maxMs, failures: m.failures, slowCalls: m.slowCalls };
  });
  mrhTraceEmit_("HOT_FUNCTION_METRICS", "(aggregate)", { hotFunctionCount: names.length, slowestFunctions: slowest });
  MRH_TRACE_STATE_.hotMetrics = Object.create(null);
}

var MRH_TRACE_BOOTSTRAP_FUNCTIONS_ = [
  "doGet",
  "doPost",
  "scheduledDatabaseSync",
  "triggerBuildDatabaseCache",
  "forceFullRebuildDatabaseCache",
  "resumeBuildDatabaseCache",
  "processReviewerAccessRequestNotifications",
  "processReviewerPdfQueue",
  "onEdit",
  "uuidSheetEdited",
  "setupTriggers",
  "resetEverythingAndStartFresh",
  "migrateDeckPasswordsToPbkdf2",
  "resumeDeckPasswordHashMigration",
  "cleanupMRHPersistentRateLimitState",
  "setupMRHPersistentRateLimitCleanupTrigger",
];

function mrhInstallExecutionLogging_(installAll) {
  var installCompleteSet = installAll === true;
  if (installCompleteSet ? MRH_TRACE_STATE_.wrappedAll : MRH_TRACE_STATE_.wrapped) return;
  // Bootstrap only wraps entry points without calling Apps Script services.
  // On the first dispatched entry point, read MRH_TRACE_ENABLED; only if enabled
  // are all helpers instrumented. Normal production requests pay no per-helper cost.
  var root = typeof globalThis !== "undefined" ? globalThis : null;
  if (!root) throw new Error("globalThis is unavailable in this runtime");

  var targetFunctions = installCompleteSet
    ? MRH_TRACE_FUNCTIONS_
    : MRH_TRACE_BOOTSTRAP_FUNCTIONS_;
  var hot = Object.create(null);
  MRH_TRACE_HOT_FUNCTIONS_.forEach(function (name) { hot[name] = true; });
  var wrappedNames = [];
  var missingNames = [];

  targetFunctions.forEach(function (name) {
    var original = root[name];
    if (typeof original !== "function") {
      missingNames.push(name);
      return;
    }
    if (original.__mrhExecutionLoggerWrapped === true) {
      wrappedNames.push(name);
      return;
    }

    var isHot = !!hot[name];
    var wrapper = function () {
      // A production request runs the original entry point directly. Detailed
      // wrappers for internal functions are installed only when tracing is enabled.
      if (!mrhTraceIsEnabled_()) return original.apply(this, arguments);
      if (!MRH_TRACE_STATE_.wrappedAll) mrhInstallExecutionLogging_(true);
      var started = Date.now();
      var isMajor = mrhTraceMajorFunction_(name);
      MRH_TRACE_STATE_.depth += 1;
      MRH_TRACE_STATE_.functionStack.push(name);
      if (MRH_TRACE_STATE_.depth === 1 && !MRH_TRACE_STATE_.installationEventEmitted) {
        MRH_TRACE_STATE_.installationEventEmitted = true;
        try {
          mrhTraceEmit_("LOGGER_INSTALLED", "mrhInstallExecutionLogging_", MRH_TRACE_STATE_.installSummary || {
            wrappedCount: MRH_TRACE_STATE_.wrappedCount,
            unavailableCount: 0,
            unavailable: [],
          });
        } catch (installTraceError) {}
      }
      var shouldTraceEachCall = isMajor || MRH_TRACE_EVERY_HOT_CALL_ || (LoggerService.getConfiguredLevel_() === "DEBUG" && !isHot);
      if (shouldTraceEachCall) {
        try { mrhTraceEmit_("ENTER", name, mrhTraceArgsSummary_(name, arguments)); } catch (traceEntryError) {}
      }

      var failed = false;
      try {
        var result = original.apply(this, arguments);
        var elapsed = Date.now() - started;
        if (isHot) {
          mrhTraceRecordHotMetric_(name, elapsed, false);
          if (!shouldTraceEachCall && elapsed >= MRH_TRACE_SLOW_CALL_MS_) {
            mrhTraceEmit_("SLOW_HOT_FUNCTION", name, {
              durationMs: elapsed,
              thresholdMs: MRH_TRACE_SLOW_CALL_MS_,
            });
          }
        }
        if (shouldTraceEachCall) {
          try {
            var resultSummary = mrhTraceResultSummary_(result);
            resultSummary.durationMs = elapsed;
            mrhTraceEmit_("EXIT", name, resultSummary);
          } catch (traceExitError) {}
        }
        return result;
      } catch (error) {
        failed = true;
        var failedElapsed = Date.now() - started;
        if (isHot) mrhTraceRecordHotMetric_(name, failedElapsed, true);
        try {
          var errorFields = mrhTraceErrorInfo_(error);
          errorFields.durationMs = failedElapsed;
          mrhTraceEmit_("THROW", name, errorFields);
        } catch (traceError) {}
        throw error;
      } finally {
        var finalElapsed = Date.now() - started;
        mrhTraceRecordFunctionMetric_(name, finalElapsed, failed);
        if (MRH_TRACE_STATE_.functionStack.length) MRH_TRACE_STATE_.functionStack.pop();
        MRH_TRACE_STATE_.depth = Math.max(0, MRH_TRACE_STATE_.depth - 1);
        if (MRH_TRACE_STATE_.depth === 0) {
          try {
            mrhTraceEmit_("EXECUTION_SCOPE_END", name, {
              durationMs: Date.now() - MRH_TRACE_STATE_.startedAt,
              failed: failed,
              operationCounts: LoggerService.getOperationMetrics_(),
            });
            mrhTraceFlushFunctionMetrics_();
            mrhTraceFlushHotMetrics_();
            LoggerService.flush();
          } catch (traceFlushError) {}
        }
      }
    };
    wrapper.__mrhExecutionLoggerWrapped = true;
    wrapper.__mrhOriginalFunction = original;
    try {
      root[name] = wrapper;
      if (root[name] === wrapper) wrappedNames.push(name);
      else missingNames.push(name + " (assignment did not take effect)");
    } catch (assignError) {
      missingNames.push(name + " (" + String(assignError) + ")");
    }
  });

  MRH_TRACE_STATE_.wrapped = true;
  if (installCompleteSet) MRH_TRACE_STATE_.wrappedAll = true;
  MRH_TRACE_STATE_.wrappedCount = wrappedNames.length;
  MRH_TRACE_STATE_.installSummary = {
    wrappedCount: wrappedNames.length,
    hotFunctionsAggregated: installCompleteSet
      ? MRH_TRACE_HOT_FUNCTIONS_.filter(function (name) {
          return !MRH_TRACE_EVERY_HOT_CALL_ && wrappedNames.indexOf(name) !== -1;
        })
      : [],
    unavailableCount: missingNames.length,
    unavailable: missingNames.slice(0, 30),
    perCallHotTracing: MRH_TRACE_EVERY_HOT_CALL_,
  };
}

// Top-level bootstrap only replaces function references; it does not call Apps Script services.
// Logging begins inside the first dispatched handler, after its execution context exists.
try {
  mrhInstallExecutionLogging_();
} catch (mrhInstallError_) {
  try {
    var bootstrapFailure = {
      timestamp: new Date().toISOString(),
      logLevel: "ERROR",
      executionId: "bootstrap-" + String(Date.now()),
      userEmail: "",
      functionName: "mrhInstallExecutionLogging_",
      category: "BUSINESS_LOGIC",
      message: "Execution logger bootstrap failed",
      metadata: {},
      errorDetails: {
        name: mrhLoggerSafeText_(mrhInstallError_ && mrhInstallError_.name || "Error", 100),
        message: mrhLoggerSafeText_(mrhInstallError_ && mrhInstallError_.message || mrhInstallError_, 1200),
        stack: mrhLoggerSafeText_(mrhInstallError_ && mrhInstallError_.stack || "", 8000),
      },
    };
    var serializedBootstrapFailure = JSON.stringify(bootstrapFailure);
    if (typeof console !== "undefined" && console && typeof console.error === "function")
      console.error(serializedBootstrapFailure);
    else Logger.log(serializedBootstrapFailure);
  } catch (ignored) {}
}
