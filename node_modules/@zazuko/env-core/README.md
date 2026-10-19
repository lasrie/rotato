# `@zazuko/env-core`

This package extends the `@rdfjs/environment` interface with the functionality to create environments that extend another.

## Usage

### Creating env

The basic usage is exactly the same as the `@rdfjs/environment` package.

```js
import Environment from '@zazuko/env-core'
import DatasetCoreFactory from '@rdfjs/dataset/Factory.js'
import DataFactory from '@rdfjs/data-model/Factory.js'

const env = new Environment([
  DataFactory,
  DatasetCoreFactory,
])

const dataset = env.dataset([
  env.quad(env.blankNode(), env.namedNode('http://example.com/p'), env.literal('o')),
])
```

### Extend environment with more factories

You can extend an environment with more factories.

```js
import Environment from '@zazuko/env-core'
import NamespaceFactory from '@rdfjs/namespace/Factory.js'

let env // from first example

const childEnv = new Environment([NamespaceFactory], { parent: env })

const ns = childEnv.namespace('http://example.com/')
const p = ns('p')
```

### Combine two environments

Alternatively, you can extend an environment with another environment. This may be more pragmatic in some scenarios.

```js
import Environment from '@zazuko/env-core'
import NamespaceFactory from '@rdfjs/namespace/Factory.js'

let baseEnv // from first example
const extendingEnv = new Environment([NamespaceFactory])

const childEnv = new Environment(extendingEnv, { parent: baseEnv })

const ns = childEnv.namespace('http://example.com/')
const p = ns('p')
```

## Typescript types of environments

All environments created with this package will be strongly typed, including derived environments. The
base is the same as with the `@rdfjs/environment` package, whose types are maintained on Definitely Typed.

You can also declare types for your own environments, which let you specify which factories are required by your code.

```ts
import type { Environment } from '@rdfjs/environment/Environment.js'
import DatasetCoreFactory from '@rdfjs/dataset/Factory.js'
import DataFactory from '@rdfjs/data-model/Factory.js'
import NamespaceFactory from '@rdfjs/namespace/Factory.js'

type MyEnv = Environment<[
  DataFactory,
  DatasetCoreFactory,
  NamespaceFactory
]>
```

You can also strongly type derived environment without the need to repeat all factories.

```ts
import type { DerivedEnvironment } from '@zazuko/env-core'
import type { Environment } from '@rdfjs/environment/Environment.js'
import DatasetCoreFactory from '@rdfjs/dataset/Factory.js'
import DataFactory from '@rdfjs/data-model/Factory.js'
import NamespaceFactory from '@rdfjs/namespace/Factory.js'

type BaseEnv = Environment<[
  DataFactory,
  DatasetCoreFactory,
  NamespaceFactory
]>

type ExtendingEnv = Environment<[
  NamespaceFactory
]>

type MyEnv = DerivedEnvironment<BaseEnv, ExtendingEnv>
```
