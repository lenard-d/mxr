#!/usr/bin/env bash
set -euo pipefail

repo="${MXR_GITHUB_REPO:-lenard-d/mxr}"
branch="${MXR_DEPLOY_BRANCH:-main}"
workflow="${MXR_BUILD_WORKFLOW:-build-vps.yml}"
target="${MXR_DEPLOY_TARGET:-/home/lenard/apps/mxr/current/mxr}"
service="${MXR_SYSTEMD_SERVICE:-mxr.service}"
run_id="${1:-}"

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

command -v gh >/dev/null || die "gh is required"
command -v systemctl >/dev/null || die "systemctl is required"
[[ -f "$target" ]] || die "deployment target does not exist: $target"

if [[ -n "$run_id" ]]; then
  run_json="$(gh run view "$run_id" --repo "$repo" --json databaseId,headSha,status,conclusion,workflowName)"
else
  run_json="$(gh run list \
    --repo "$repo" \
    --workflow "$workflow" \
    --branch "$branch" \
    --status success \
    --limit 1 \
    --json databaseId,headSha,status,conclusion,workflowName \
    --jq '.[0]')"
fi

[[ -n "$run_json" && "$run_json" != "null" ]] || die "no successful $workflow run found for $branch"

read -r run_id head_sha status conclusion workflow_name < <(
  python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["databaseId"], d["headSha"], d["status"], d.get("conclusion") or "", d["workflowName"].replace(" ", "_"))' <<<"$run_json"
)

[[ "$status" == "completed" && "$conclusion" == "success" ]] || die "run $run_id is not successful ($status/$conclusion)"
[[ "$workflow_name" == "Build_VPS_binary" ]] || die "run $run_id belongs to unexpected workflow: $workflow_name"

artifact="mxr-linux-x86_64-$head_sha"
tmp_dir="$(mktemp -d /tmp/mxr-deploy.XXXXXXXX)"
trap 'rm -rf "$tmp_dir"' EXIT

gh run download "$run_id" --repo "$repo" --name "$artifact" --dir "$tmp_dir"
[[ -x "$tmp_dir/mxr" || -f "$tmp_dir/mxr" ]] || die "artifact does not contain mxr"
checksum_line="$(<"$tmp_dir/mxr.sha256")"
expected_checksum="${checksum_line%% *}"
actual_checksum_line="$(sha256sum "$tmp_dir/mxr")"
actual_checksum="${actual_checksum_line%% *}"
[[ "$actual_checksum" == "$expected_checksum" ]] || die "artifact checksum does not match"
printf 'mxr: checksum OK\n'

install -m 0755 "$tmp_dir/mxr" "$target.new"
"$target.new" --version
mv -f "$target.new" "$target"

systemctl --user restart "$service"
systemctl --user is-active --quiet "$service" || die "$service did not become active"

for attempt in {1..30}; do
  if curl --fail --silent --show-error --max-time 10 \
    --output /dev/null https://mail.lenard-duenkel.com/; then
    printf 'deployed run=%s sha=%s service=%s endpoint=200\n' "$run_id" "$head_sha" "$service"
    exit 0
  fi
  if [[ "$attempt" -lt 30 ]]; then
    sleep 1
  fi
done

die "service restarted, but mail.lenard-duenkel.com did not become healthy"
