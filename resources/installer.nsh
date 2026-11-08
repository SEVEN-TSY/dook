!define DOOK_DATA_LOCATION "dook-data-location.txt"

!macro readDookDataDirectory directory output
  StrCpy ${output} ""
  ClearErrors
  FileOpen $R0 "${directory}\${DOOK_DATA_LOCATION}" r
  ${IfNot} ${Errors}
    FileReadUTF16LE $R0 ${output}
    FileClose $R0
  ${EndIf}
!macroend

!ifndef BUILD_UNINSTALLER
  !include nsDialogs.nsh
  Var dookDataDirectory
  Var dookDataField

  !macro customInit
    !insertmacro readDookDataDirectory "$INSTDIR" $dookDataDirectory
  !macroend

  !macro customPageAfterChangeDir
    Page custom DookDataDirectoryPage DookDataDirectoryLeave
  !macroend

  !macro defineDookInstallerFunctions
  Function DookDataDirectoryPage
    Call instFilesPre
    ${If} $dookDataDirectory == ""
      !insertmacro readDookDataDirectory "$INSTDIR" $dookDataDirectory
    ${EndIf}
    ${If} $installMode == "all"
    ${OrIf} $dookDataDirectory != ""
      Abort
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "用户数据目录" "选择任务、设置和小记保存的位置。"
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 26u "默认保存到安装目录的 data 子目录。也可以选择当前 Windows 账户可写入的专用文件夹。"
    Pop $0
    ${NSD_CreateDirRequest} 0 34u 74% 13u "$INSTDIR\data"
    Pop $dookDataField
    ${NSD_CreateBrowseButton} 77% 33u 23% 15u "浏览..."
    Pop $0
    ${NSD_OnClick} $0 DookBrowseDataDirectory
    nsDialogs::Show
  FunctionEnd

  Function DookBrowseDataDirectory
    Pop $0
    ${NSD_GetText} $dookDataField $0
    nsDialogs::SelectFolderDialog "选择用户数据目录" "$0"
    Pop $0
    ${If} $0 != error
      ${NSD_SetText} $dookDataField "$0"
    ${EndIf}
  FunctionEnd

  Function DookDataDirectoryLeave
    ${NSD_GetText} $dookDataField $0
    System::Call 'shlwapi::PathIsRelativeW(w r0) i.r1'
    ${If} $0 == ""
    ${OrIf} $1 != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "请选择一个完整的数据目录路径。"
      Abort
    ${EndIf}
    GetFullPathName $0 "$0"
    System::Call 'shlwapi::PathIsPrefixW(w "$INSTDIR", w r0) i.r1'
    ${If} $1 != 0
    ${AndIf} $0 != "$INSTDIR\data"
      MessageBox MB_OK|MB_ICONEXCLAMATION "请选择安装目录的 data 子目录，或安装目录之外的文件夹。"
      Abort
    ${EndIf}
    ${If} ${FileExists} "$0"
    ${AndIfNot} ${FileExists} "$0\*.*"
      MessageBox MB_OK|MB_ICONEXCLAMATION "这个位置是文件。请选择一个文件夹。"
      Abort
    ${EndIf}
    StrCpy $dookDataDirectory "$0"
  FunctionEnd
  !macroend
!endif

!macro customInstall
  ${If} $installMode == "all"
    Delete "$INSTDIR\${DOOK_DATA_LOCATION}"
  ${Else}
    ${If} $dookDataDirectory == ""
      !insertmacro readDookDataDirectory "$INSTDIR" $dookDataDirectory
    ${EndIf}
    ${If} $dookDataDirectory == ""
      StrCpy $dookDataDirectory "$INSTDIR\data"
    ${EndIf}
    ClearErrors
    CreateDirectory "$dookDataDirectory"
    ${IfNot} ${Errors}
      FileOpen $R0 "$INSTDIR\${DOOK_DATA_LOCATION}.tmp" w
      ${IfNot} ${Errors}
        FileWriteUTF16LE $R0 "$dookDataDirectory"
        FileClose $R0
      ${EndIf}
    ${EndIf}
    ${If} ${Errors}
      Abort "无法写入用户数据目录设置。请选择当前账户可写入的目录。"
    ${EndIf}
    System::Call 'kernel32::MoveFileExW(w "$INSTDIR\${DOOK_DATA_LOCATION}.tmp", w "$INSTDIR\${DOOK_DATA_LOCATION}", i 1) i.r0'
    ${If} $0 == 0
      Abort "无法保存用户数据目录设置。"
    ${EndIf}
  ${EndIf}
  # Refresh the application ID on shortcuts preserved during an upgrade.
  ${If} ${FileExists} "$newStartMenuLink"
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${EndIf}
  ${If} ${FileExists} "$newDesktopLink"
    WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
  ${EndIf}
!macroend

!define UNINSTALL_SECTION_NAME "DOOK"

!macro customRemoveFiles
  Call un.RemoveDookProgram
!macroend

!ifdef BUILD_UNINSTALLER
  !macro defineDookUninstallerFunctions
  Function un.RemoveDookProgram
    SetOutPath $TEMP
    InitPluginsDir
    CreateDirectory "$PLUGINSDIR\old-install"
    FindFirst $R4 $R5 "$INSTDIR\*.*"
    ${While} $R5 != ""
      ${If} $R5 != "."
      ${AndIf} $R5 != ".."
      ${AndIf} $R5 != "data"
      ${AndIf} $R5 != "${DOOK_DATA_LOCATION}"
      ${AndIf} $R5 != "${UNINSTALL_FILENAME}"
        # Reuse the installer's staging and rollback for program files only.
        ${If} ${FileExists} "$INSTDIR\$R5\*.*"
          CreateDirectory "$PLUGINSDIR\old-install\$R5"
          Push "\$R5"
          Call un.atomicRMDir
          Pop $R6
        ${Else}
          StrCpy $R6 0
          ClearErrors
          Rename "$INSTDIR\$R5" "$PLUGINSDIR\old-install\$R5"
          ${If} ${Errors}
            StrCpy $R6 "$R5"
          ${EndIf}
        ${EndIf}
        ${If} $R6 != 0
          FindClose $R4
          Push ""
          Call un.restoreFiles
          Pop $R0
          Abort "无法卸载 DOOK，文件正在使用：$R6"
        ${EndIf}
      ${EndIf}
      FindNext $R4 $R5
    ${EndWhile}
    FindClose $R4

    # The program directories are empty after staging. Remove only children of the install root.
    FindFirst $R4 $R5 "$INSTDIR\*.*"
    ${While} $R5 != ""
      ${If} $R5 != "."
      ${AndIf} $R5 != ".."
      ${AndIf} $R5 != "data"
      ${AndIf} ${FileExists} "$INSTDIR\$R5\*.*"
        GetFullPathName $R6 "$INSTDIR\$R5"
        ${If} $R6 == "$INSTDIR\$R5"
          RMDir /r "$R6"
        ${EndIf}
      ${EndIf}
      FindNext $R4 $R5
    ${EndWhile}
    FindClose $R4
    Delete "$INSTDIR\${UNINSTALL_FILENAME}"
    RMDir "$INSTDIR"
  FunctionEnd

  Function un.RemoveDookData
    Exch $0
    Push $1
    Push $2
    Push $3
    ClearErrors
    System::Call 'kernel32::GetFileAttributesW(w r0) i.r1 ?e'
    Pop $2
    ${If} $1 == -1
      ${If} $2 != 2
      ${AndIf} $2 != 3
        SetErrors
      ${EndIf}
    ${Else}
      IntOp $2 $1 & 0x10 ; directory
      IntOp $3 $1 & 0x400 ; reparse point
      ${If} $2 == 0
        Delete "$0"
      ${Else}
        # Remove directory links themselves without traversing their targets.
        ${If} $3 == 0
          FindFirst $1 $2 "$0\*.*"
          ${While} $2 != ""
            ${If} $2 != "."
            ${AndIf} $2 != ".."
              Push "$0\$2"
              Call un.RemoveDookData
            ${EndIf}
            FindNext $1 $2
          ${EndWhile}
          FindClose $1
        ${EndIf}
        ClearErrors
        RMDir "$0"
      ${EndIf}
    ${EndIf}
    Pop $3
    Pop $2
    Pop $1
    Pop $0
  FunctionEnd
  !macroend
!endif

!macro customHeader
  !ifdef BUILD_UNINSTALLER
    !insertmacro defineDookUninstallerFunctions
  !else
    !insertmacro defineDookInstallerFunctions
  !endif
!macroend

!macro deleteDookData directory database
  Delete "${directory}\${database}"
  Delete "${directory}\${database}-wal"
  Delete "${directory}\${database}-shm"
  Delete "${directory}\${database}-journal"
  Delete "${directory}\desktop-settings.json"
  Delete "${directory}\desktop-settings.json.tmp"
  Delete "${directory}\note-position.json"
  Delete "${directory}\mcp-token"
!macroend

!macro customUnInstallSection
  Section /o "un.同时删除本机用户数据"
    ${IfNot} ${Silent}
    ${AndIfNot} ${isUpdated}
      SetShellVarContext current
      ClearErrors
      # Remove the legacy migration inputs first so reinstall starts fresh.
      !insertmacro deleteDookData "$APPDATA\myTodo" "mytodo.sqlite"
      ${IfNot} ${Errors}
        !insertmacro deleteDookData "$APPDATA\dook" "dook.sqlite"
      ${EndIf}
      ${IfNot} ${Errors}
        !insertmacro readDookDataDirectory "$INSTDIR" $R1
        ClearErrors
        ${If} $R1 != ""
          System::Call 'shlwapi::PathIsRelativeW(w "$R1") i.r0'
          ${If} $0 == 0
            ${If} $R1 == "$INSTDIR\data"
              Push "$INSTDIR\data"
              Call un.RemoveDookData
            ${Else}
              !insertmacro deleteDookData "$R1" "dook.sqlite"
            ${EndIf}
          ${Else}
            SetErrors
          ${EndIf}
        ${EndIf}
      ${EndIf}
      ${If} ${Errors}
        MessageBox MB_OK|MB_ICONEXCLAMATION "DOOK 已卸载，部分本机用户数据未能删除。请检查用户数据目录。"
        SetErrorLevel 1
      ${Else}
        Delete "$INSTDIR\${DOOK_DATA_LOCATION}"
        RMDir "$INSTDIR"
      ${EndIf}
      ${If} $installMode == "all"
        SetShellVarContext all
      ${EndIf}
    ${EndIf}
  SectionEnd
!macroend
