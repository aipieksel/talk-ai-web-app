#!/bin/zsh

set -euo pipefail

readonly USER_DATA_DIR="${HOME}/Library/Application Support/Talk AI"
readonly SOURCE_DIR="${USER_DATA_DIR}/WhisperKit-source"
readonly BIN_DIR="${USER_DATA_DIR}/bin"
readonly CLI_PATH="${BIN_DIR}/whisperkit-cli"
readonly WHISPERKIT_REPOSITORY="https://github.com/argmaxinc/WhisperKit.git"
readonly WHISPERKIT_REVISION="26577ce3017aae8c9edfd9a0dd17851bd248c731"

if [[ -x "${CLI_PATH}" ]]; then
  exit 0
fi

/bin/mkdir -p "${USER_DATA_DIR}" "${BIN_DIR}"
if [[ ! -d "${SOURCE_DIR}/.git" ]]; then
  /usr/bin/git clone "${WHISPERKIT_REPOSITORY}" "${SOURCE_DIR}"
fi
/usr/bin/git -C "${SOURCE_DIR}" fetch origin "${WHISPERKIT_REVISION}"
/usr/bin/git -C "${SOURCE_DIR}" switch --detach "${WHISPERKIT_REVISION}"
/usr/bin/swift build --package-path "${SOURCE_DIR}" -c release --product whisperkit-cli
/bin/cp "${SOURCE_DIR}/.build/release/whisperkit-cli" "${CLI_PATH}"
/bin/chmod 755 "${CLI_PATH}"
