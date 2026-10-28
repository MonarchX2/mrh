function configureMrhSupabaseProperties() {
  const props = PropertiesService.getScriptProperties();

  props.setProperty(
    'MRH_SUPABASE_URL',
    'here'
  );

  props.setProperty(
    'MRH_SUPABASE_SECRET_KEY',
    'here'
  );

  if (
    !props.getProperty('MRH_SUPABASE_URL') ||
    !props.getProperty('MRH_SUPABASE_SECRET_KEY')
  ) {
    throw new Error('Supabase Script Properties configuration failed.');
  }

  console.log('MRH Supabase Script Properties configured successfully.');
}


function authorizeCentralLogSpreadsheet() {
  const properties = PropertiesService.getScriptProperties();

  const spreadsheetId = properties.getProperty(
    'MRH_CENTRAL_LOG_SPREADSHEET_ID'
  );
  const folderId = properties.getProperty(
    'MRH_RESOURCE_PORTAL_ROOT_FOLDER_ID'
  );

  if (!spreadsheetId) {
    throw new Error('MRH_CENTRAL_LOG_SPREADSHEET_ID is missing.');
  }
  if (!folderId) {
    throw new Error('MRH_RESOURCE_PORTAL_ROOT_FOLDER_ID is missing.');
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  Logger.log('Central log access OK: ' + spreadsheet.getName());

  const folder = DriveApp.getFolderById(folderId);
  Logger.log('Reviewer PDF root access OK: ' + folder.getName());

  // Exercise the external-request scope used by Google token verification.
  const response = UrlFetchApp.fetch(
    'https://www.google.com/generate_204',
    { muteHttpExceptions: true }
  );

  Logger.log(
    'External request test completed. HTTP status: ' +
    response.getResponseCode()
  );
}

function authorizeDriveWriteScope() {
  var file = DriveApp.createFile(
    "MRH_Drive_Scope_Authorization_Test.txt",
    "Temporary authorization test."
  );

  file.setContent("Drive write authorization confirmed.");
  file.setTrashed(true);

  Logger.log("Drive write authorization succeeded.");
}


function clearAllReviewerSessions() {
  var lock = LockService.getScriptLock();

  if (!lock.tryLock(10000)) {
    throw new Error(
      "The session service is busy. Please try again."
    );
  }

  try {
    var properties = PropertiesService.getScriptProperties();
    var allProperties = properties.getProperties();
    var prefix = "MRH_REVIEWER_SESSION_v1_";
    var keysToDelete = Object.keys(allProperties).filter(
      function (key) {
        return key.indexOf(prefix) === 0;
      }
    );

    keysToDelete.forEach(function (key) {
      properties.deleteProperty(key);
    });

    var result = {
      event: "reviewer_sessions_cleared",
      deletedCount: keysToDelete.length
    };

    Logger.log(JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}



