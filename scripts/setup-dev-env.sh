#!/bin/bash
set -e

# Sets up the dev environment on a MacOS or GNU/Linux system

# working dir fix
SCRIPT_FOLDER=$(cd $(dirname "$0"); pwd)
cd $SCRIPT_FOLDER/.. # root

# setup git pre-commit hook if appropriate ($CI is "true" in GitHub workflows)
PRE_COMMIT="scripts/pre-commit"
if [[ -d .git && "$CI" != "true" ]]; then
  cp $PRE_COMMIT .git/hooks/
  echo ""
  echo "Git pre-commit hook setup from '$PRE_COMMIT'"
  echo ""
fi


echo ""
echo "Setup Dev env complete!"
echo ""