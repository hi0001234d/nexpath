# Debugging

When debugging nexpath pipeline behaviour or advisory firing issues, the following
CLI commands are available:

### `nexpath status`
Shows MCP registration across detected agents, advisory hook registration, prompt
store stats (total prompts, DB size, per-project counts), hook activity, and full
config dump. Use this first when something seems wrong.

```
nexpath status
```

### `nexpath config get <key>`
Read a single config value.

```
nexpath config get advisory_frequency
nexpath config get role
nexpath config get language_override
nexpath config get prompt_capture_enabled
```

### `nexpath config set <key> <value>`
Set a config value.

```
# Frequency level: off | major_only | once_per_session | every_event | optimum
nexpath config set advisory_frequency optimum

# Role: founder | indie_hacker | pm
nexpath config set role founder

# Clear a value
nexpath config set role ""
nexpath config unset advisory_frequency
```

### `nexpath log`
Shows recent pipeline activity — classifications, signals, and advisory decisions.

### `nexpath store delete`
Delete stored prompts for a project. Useful for a clean session state.

```
nexpath store delete --project <path>
```

### Environment variable

`NEXPATH_DEBUG=1` — enables verbose debug logging to stderr.
