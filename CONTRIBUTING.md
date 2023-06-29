# Contributing to Aligent's CDK Constructs

🙌 Welcome to the Aligent CDK Constructs repository! 🙌    

We appreciate your interest in contributing to this project. Please take a moment to review the guidelines below to ensure a smooth and collaborative contribution process.

By participating in this project, you are expected to adhere to the [Code of Conduct].
We strive to maintain a welcoming and inclusive environment for all contributors.

_These guidelines are intended to provide direction, but they are not meant to be rigid rules. We trust your judgment 
and invite you to propose any changes to this document by submitting a pull request. Your feedback is valuable, 
and we welcome collaborative improvements to these guidelines._

## Table of Contents
- [Overview](#overview)
- [How Can I Contribute?](#how-can-i-contribute) 
- [Getting Started](#getting-started)
  - [Forking the Repository](#forking-the-repository)
  - [Setting Up the Development Environment](#setting-up-the-development-environment)
- [Making Changes](#making-changes)
  - [Branching Strategy](#branching-strategy)
  - [Commit Guidelines](#commit-guidelines)
  - [Pull Request Guidelines](#pull-request-guidelines)
  - [Updating Documentation](#updating-documentation)
- [Creating a Release](#creating-a-release)
  - [Release Tag Format](#release-tag-format)

## Code of Conduct

We are committed to providing a welcoming and inclusive environment for everyone who participates in this project. 
Please review our [Code of Conduct] to understand the expectations and guidelines for behavior within the community.

## Overview
This repository contains Aligent's [AWS CDK Constructs].

Below is a list of available constructs:

- [basic-auth](packages/basic-auth) 
- [cloudfront-security-headers](packages/cloudfront-security-headers) 
- [geoip-redirect](packages/geoip-redirect) 
- [prerender-proxy](packages/prerender-proxy) 
- [rabbitmq](packages/rabbitmq) 
- [shared-vpc](packages/shared-vpc) 
- [static-hosting](packages/static-hosting) 
- [waf](packages/waf)

## How Can I Contribute?

We welcome contributions from the community, and there are several ways you can contribute to this project:
- __Reporting Issues:__ If you encounter any bugs, errors, or have suggestions for improvements, please [open an issue] on GitHub. Provide as much detail as possible to help us understand and address the problem.
- __Submitting Pull Requests:__ If you have implemented a new feature, fixed a bug, or made any other improvements to the project, we encourage you to submit a pull request. Please follow the guidelines in the [Making Changes](#making-changes) section below when creating your pull request.
- __Improving Documentation:__ Documentation is essential for the project's usability and understanding. If you find any areas that can be improved or have suggestions for new documentation, feel free to contribute by submitting a pull request.
- __Sharing Feedback:__ Your feedback and ideas are valuable to us. If you have suggestions, questions, or feedback regarding the project, please share them with us by opening an issue or participating in discussions on existing issues.

## Getting Started

### Forking the Repository

To contribute to this project, you should start by forking the repository to your GitHub account. This will create a copy of the repository under your account, which you can freely modify.

### Setting Up the Development Environment

Before making any changes, ensure that you have the necessary development environment set up. Follow the steps below:

1. Clone the forked repository to your local machine.
    ```sh
    git clone https://github.com/your-username/cdk-constructs.git
    ```
2. Install the required dependencies.
    ```sh
    cd cdk-constructs
    npm ci
    ```
Now you're ready to start making changes!

## Making Changes

### Branching Strategy

When working on a new feature or bug fix, it is recommended to create a new branch to isolate your changes. Follow these steps:

1. Create a new branch based on the main branch.
    ```sh
    git checkout -b feature/my-feature
    ```
2. Make your desired changes in the codebase.
3. Commit your changes with a descriptive message.
    ```sh
    git commit -m "Add feature: my new feature"
    ```
4. Push your branch to your forked repository.
    ```sh
    git push origin feature/my-feature
    ```
5. Open a pull request (PR) on the original repository to propose your changes.

## Commit Guidelines

When making commits, please adhere to the following guidelines:
- Use the present tense ("Add feature" not "Added feature")
- Use clear and concise commit messages
- Reference any relevant issues or pull requests in your commit message using the appropriate keywords (Fixes #issue-number, Resolves #pull-request-number, etc.)
- Limit the first line to 72 characters or less
- Make sure each commit represents a logical unit of work

## Pull Request Guidelines

To ensure a smooth review process and increase the chances of your pull request being merged, please follow these guidelines:
1. Ensure that your pull request addresses an existing issue or feature request. If none exists, consider opening one to discuss your proposed changes before submitting the pull request.
2. Provide a clear and descriptive title for your pull request. 
3. Include a detailed description of the changes you have made. Explain the purpose and benefits of your changes. 
4. Ensure that your code adheres to the project's coding conventions and style guidelines. 
5. Include any necessary documentation updates to reflect your changes. 
6. Test your changes thoroughly to avoid introducing new bugs. 
7. Keep your pull request focused and limited to a single logical change. If you have multiple unrelated changes, consider submitting separate pull requests. 
8. Be responsive to any feedback or requests for changes during the review process. Engage in constructive discussions to address any concerns raised by the reviewers. 
9. Once your pull request has been approved, it will be merged by the project maintainers.

Thank you for your valuable contributions! 🎉

## Updating Documentation

Keeping the documentation up-to-date is essential for maintaining the project's usability and ensuring that users have the necessary information. 
If you make changes to the codebase, please consider updating the relevant documentation, including the README files.

Make sure the documentation accurately reflects the changes you have made and provides clear instructions or explanations for users. Also, 
check for any outdated information and remove or update it accordingly.

### Updating README Files

For each package/construct within the monorepo, it is important to update the corresponding README.md file to reflect any changes, additions, or removals. 
Ensure that the README provides clear and concise information about the package/construct, its purpose, usage, and any necessary instructions or examples.

Make sure to include the following information in the README:
- Description of the package/construct and its functionality.
- Installation instructions, including any dependencies.
- Usage examples and code snippets to help users understand how to use the package/construct.
- Configuration options or settings, if applicable.
- Contribution guidelines, including how others can contribute to the package/construct.
- Any other relevant information or resources that would assist users.

Your efforts in updating and improving the documentation are highly appreciated.

## Creating a Release

The following section outlines the release process for maintainers.

Each construct or package in this monorepo has an independent release cycle. Once the changes have been approved and merged into the main branch, you can create a release.

**Note that for all the finalized releases, the source branch should be the main branch.**

If the release is experimental, you may use the `main` or the feature branch.

For example:
- Experimental release: `basic-auth-1.1.0-beta`
- Finalized release: `basic-auth-1.1.0`

## Note for Maintainers

The release process outlined above is primarily applicable to maintainers of this repository. As a maintainer, it is your responsibility to review and merge pull requests, 
create releases, and manage the versioning of the constructs.

Additionally, as a maintainer, please ensure that the README files for each construct are kept up-to-date. When introducing changes or new features, 
update the corresponding README to reflect those changes accurately. This will help users understand the functionality and usage of each construct.

[Code of Conduct]: ./CODE_OF_CONDUCT.md
[open an issue]: https://github.com/aligent/cdk-constructs/issues
[AWS CDK Constructs]: https://docs.aws.amazon.com/cdk/v2/guide/constructs.html
