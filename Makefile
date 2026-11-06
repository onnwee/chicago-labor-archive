.PHONY: verify verify-pins verify-scripts
verify: verify-pins verify-scripts
	pnpm --dir web install --frozen-lockfile
	pnpm --dir web typecheck
	pnpm --dir web lint
	pnpm --dir web test
	pnpm --dir web build
	docker compose -f deploy/compose.yml --env-file deploy/compose.check.env config --quiet

verify-pins:
	python3 scripts/check_core_pin.py
	python3 scripts/check_viewer_pin.py

verify-scripts:
	python3 -m py_compile scripts/build_import.py
	python3 -m unittest discover -s scripts -p 'test_*.py'
	sh -n scripts/import.sh
