**Github PR MCP Tool**

***Problem**
- Automate process of making PR via code change by github cli

***Solution***
- use github cli and AI LLM to detect code diff between current branch vs target branch
- create check list by commit message
- summary code changed to description

***Feature***
- 1 shot create PR with good
    - title: link with task number
    - descripton: based on commit and code change each commit
    - custom: custom config for each repo like reviewers, prompt