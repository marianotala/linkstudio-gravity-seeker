"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/react/cjs/react.production.min.js
var require_react_production_min = __commonJS({
  "node_modules/react/cjs/react.production.min.js"(exports2) {
    "use strict";
    var l = /* @__PURE__ */ Symbol.for("react.element");
    var n = /* @__PURE__ */ Symbol.for("react.portal");
    var p = /* @__PURE__ */ Symbol.for("react.fragment");
    var q = /* @__PURE__ */ Symbol.for("react.strict_mode");
    var r = /* @__PURE__ */ Symbol.for("react.profiler");
    var t = /* @__PURE__ */ Symbol.for("react.provider");
    var u = /* @__PURE__ */ Symbol.for("react.context");
    var v = /* @__PURE__ */ Symbol.for("react.forward_ref");
    var w = /* @__PURE__ */ Symbol.for("react.suspense");
    var x = /* @__PURE__ */ Symbol.for("react.memo");
    var y = /* @__PURE__ */ Symbol.for("react.lazy");
    var z = Symbol.iterator;
    function A(a) {
      if (null === a || "object" !== typeof a) return null;
      a = z && a[z] || a["@@iterator"];
      return "function" === typeof a ? a : null;
    }
    var B = { isMounted: function() {
      return false;
    }, enqueueForceUpdate: function() {
    }, enqueueReplaceState: function() {
    }, enqueueSetState: function() {
    } };
    var C = Object.assign;
    var D = {};
    function E(a, b, e) {
      this.props = a;
      this.context = b;
      this.refs = D;
      this.updater = e || B;
    }
    E.prototype.isReactComponent = {};
    E.prototype.setState = function(a, b) {
      if ("object" !== typeof a && "function" !== typeof a && null != a) throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
      this.updater.enqueueSetState(this, a, b, "setState");
    };
    E.prototype.forceUpdate = function(a) {
      this.updater.enqueueForceUpdate(this, a, "forceUpdate");
    };
    function F() {
    }
    F.prototype = E.prototype;
    function G(a, b, e) {
      this.props = a;
      this.context = b;
      this.refs = D;
      this.updater = e || B;
    }
    var H = G.prototype = new F();
    H.constructor = G;
    C(H, E.prototype);
    H.isPureReactComponent = true;
    var I = Array.isArray;
    var J = Object.prototype.hasOwnProperty;
    var K = { current: null };
    var L = { key: true, ref: true, __self: true, __source: true };
    function M(a, b, e) {
      var d, c = {}, k = null, h = null;
      if (null != b) for (d in void 0 !== b.ref && (h = b.ref), void 0 !== b.key && (k = "" + b.key), b) J.call(b, d) && !L.hasOwnProperty(d) && (c[d] = b[d]);
      var g = arguments.length - 2;
      if (1 === g) c.children = e;
      else if (1 < g) {
        for (var f = Array(g), m = 0; m < g; m++) f[m] = arguments[m + 2];
        c.children = f;
      }
      if (a && a.defaultProps) for (d in g = a.defaultProps, g) void 0 === c[d] && (c[d] = g[d]);
      return { $$typeof: l, type: a, key: k, ref: h, props: c, _owner: K.current };
    }
    function N(a, b) {
      return { $$typeof: l, type: a.type, key: b, ref: a.ref, props: a.props, _owner: a._owner };
    }
    function O(a) {
      return "object" === typeof a && null !== a && a.$$typeof === l;
    }
    function escape(a) {
      var b = { "=": "=0", ":": "=2" };
      return "$" + a.replace(/[=:]/g, function(a2) {
        return b[a2];
      });
    }
    var P = /\/+/g;
    function Q(a, b) {
      return "object" === typeof a && null !== a && null != a.key ? escape("" + a.key) : b.toString(36);
    }
    function R(a, b, e, d, c) {
      var k = typeof a;
      if ("undefined" === k || "boolean" === k) a = null;
      var h = false;
      if (null === a) h = true;
      else switch (k) {
        case "string":
        case "number":
          h = true;
          break;
        case "object":
          switch (a.$$typeof) {
            case l:
            case n:
              h = true;
          }
      }
      if (h) return h = a, c = c(h), a = "" === d ? "." + Q(h, 0) : d, I(c) ? (e = "", null != a && (e = a.replace(P, "$&/") + "/"), R(c, b, e, "", function(a2) {
        return a2;
      })) : null != c && (O(c) && (c = N(c, e + (!c.key || h && h.key === c.key ? "" : ("" + c.key).replace(P, "$&/") + "/") + a)), b.push(c)), 1;
      h = 0;
      d = "" === d ? "." : d + ":";
      if (I(a)) for (var g = 0; g < a.length; g++) {
        k = a[g];
        var f = d + Q(k, g);
        h += R(k, b, e, f, c);
      }
      else if (f = A(a), "function" === typeof f) for (a = f.call(a), g = 0; !(k = a.next()).done; ) k = k.value, f = d + Q(k, g++), h += R(k, b, e, f, c);
      else if ("object" === k) throw b = String(a), Error("Objects are not valid as a React child (found: " + ("[object Object]" === b ? "object with keys {" + Object.keys(a).join(", ") + "}" : b) + "). If you meant to render a collection of children, use an array instead.");
      return h;
    }
    function S(a, b, e) {
      if (null == a) return a;
      var d = [], c = 0;
      R(a, d, "", "", function(a2) {
        return b.call(e, a2, c++);
      });
      return d;
    }
    function T(a) {
      if (-1 === a._status) {
        var b = a._result;
        b = b();
        b.then(function(b2) {
          if (0 === a._status || -1 === a._status) a._status = 1, a._result = b2;
        }, function(b2) {
          if (0 === a._status || -1 === a._status) a._status = 2, a._result = b2;
        });
        -1 === a._status && (a._status = 0, a._result = b);
      }
      if (1 === a._status) return a._result.default;
      throw a._result;
    }
    var U = { current: null };
    var V = { transition: null };
    var W = { ReactCurrentDispatcher: U, ReactCurrentBatchConfig: V, ReactCurrentOwner: K };
    function X() {
      throw Error("act(...) is not supported in production builds of React.");
    }
    exports2.Children = { map: S, forEach: function(a, b, e) {
      S(a, function() {
        b.apply(this, arguments);
      }, e);
    }, count: function(a) {
      var b = 0;
      S(a, function() {
        b++;
      });
      return b;
    }, toArray: function(a) {
      return S(a, function(a2) {
        return a2;
      }) || [];
    }, only: function(a) {
      if (!O(a)) throw Error("React.Children.only expected to receive a single React element child.");
      return a;
    } };
    exports2.Component = E;
    exports2.Fragment = p;
    exports2.Profiler = r;
    exports2.PureComponent = G;
    exports2.StrictMode = q;
    exports2.Suspense = w;
    exports2.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = W;
    exports2.act = X;
    exports2.cloneElement = function(a, b, e) {
      if (null === a || void 0 === a) throw Error("React.cloneElement(...): The argument must be a React element, but you passed " + a + ".");
      var d = C({}, a.props), c = a.key, k = a.ref, h = a._owner;
      if (null != b) {
        void 0 !== b.ref && (k = b.ref, h = K.current);
        void 0 !== b.key && (c = "" + b.key);
        if (a.type && a.type.defaultProps) var g = a.type.defaultProps;
        for (f in b) J.call(b, f) && !L.hasOwnProperty(f) && (d[f] = void 0 === b[f] && void 0 !== g ? g[f] : b[f]);
      }
      var f = arguments.length - 2;
      if (1 === f) d.children = e;
      else if (1 < f) {
        g = Array(f);
        for (var m = 0; m < f; m++) g[m] = arguments[m + 2];
        d.children = g;
      }
      return { $$typeof: l, type: a.type, key: c, ref: k, props: d, _owner: h };
    };
    exports2.createContext = function(a) {
      a = { $$typeof: u, _currentValue: a, _currentValue2: a, _threadCount: 0, Provider: null, Consumer: null, _defaultValue: null, _globalName: null };
      a.Provider = { $$typeof: t, _context: a };
      return a.Consumer = a;
    };
    exports2.createElement = M;
    exports2.createFactory = function(a) {
      var b = M.bind(null, a);
      b.type = a;
      return b;
    };
    exports2.createRef = function() {
      return { current: null };
    };
    exports2.forwardRef = function(a) {
      return { $$typeof: v, render: a };
    };
    exports2.isValidElement = O;
    exports2.lazy = function(a) {
      return { $$typeof: y, _payload: { _status: -1, _result: a }, _init: T };
    };
    exports2.memo = function(a, b) {
      return { $$typeof: x, type: a, compare: void 0 === b ? null : b };
    };
    exports2.startTransition = function(a) {
      var b = V.transition;
      V.transition = {};
      try {
        a();
      } finally {
        V.transition = b;
      }
    };
    exports2.unstable_act = X;
    exports2.useCallback = function(a, b) {
      return U.current.useCallback(a, b);
    };
    exports2.useContext = function(a) {
      return U.current.useContext(a);
    };
    exports2.useDebugValue = function() {
    };
    exports2.useDeferredValue = function(a) {
      return U.current.useDeferredValue(a);
    };
    exports2.useEffect = function(a, b) {
      return U.current.useEffect(a, b);
    };
    exports2.useId = function() {
      return U.current.useId();
    };
    exports2.useImperativeHandle = function(a, b, e) {
      return U.current.useImperativeHandle(a, b, e);
    };
    exports2.useInsertionEffect = function(a, b) {
      return U.current.useInsertionEffect(a, b);
    };
    exports2.useLayoutEffect = function(a, b) {
      return U.current.useLayoutEffect(a, b);
    };
    exports2.useMemo = function(a, b) {
      return U.current.useMemo(a, b);
    };
    exports2.useReducer = function(a, b, e) {
      return U.current.useReducer(a, b, e);
    };
    exports2.useRef = function(a) {
      return U.current.useRef(a);
    };
    exports2.useState = function(a) {
      return U.current.useState(a);
    };
    exports2.useSyncExternalStore = function(a, b, e) {
      return U.current.useSyncExternalStore(a, b, e);
    };
    exports2.useTransition = function() {
      return U.current.useTransition();
    };
    exports2.version = "18.3.1";
  }
});

// node_modules/react/cjs/react.development.js
var require_react_development = __commonJS({
  "node_modules/react/cjs/react.development.js"(exports2, module2) {
    "use strict";
    if (process.env.NODE_ENV !== "production") {
      (function() {
        "use strict";
        if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart === "function") {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(new Error());
        }
        var ReactVersion = "18.3.1";
        var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.element");
        var REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal");
        var REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment");
        var REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode");
        var REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler");
        var REACT_PROVIDER_TYPE = /* @__PURE__ */ Symbol.for("react.provider");
        var REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context");
        var REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref");
        var REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense");
        var REACT_SUSPENSE_LIST_TYPE = /* @__PURE__ */ Symbol.for("react.suspense_list");
        var REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo");
        var REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy");
        var REACT_OFFSCREEN_TYPE = /* @__PURE__ */ Symbol.for("react.offscreen");
        var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
        var FAUX_ITERATOR_SYMBOL = "@@iterator";
        function getIteratorFn(maybeIterable) {
          if (maybeIterable === null || typeof maybeIterable !== "object") {
            return null;
          }
          var maybeIterator = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable[FAUX_ITERATOR_SYMBOL];
          if (typeof maybeIterator === "function") {
            return maybeIterator;
          }
          return null;
        }
        var ReactCurrentDispatcher = {
          /**
           * @internal
           * @type {ReactComponent}
           */
          current: null
        };
        var ReactCurrentBatchConfig = {
          transition: null
        };
        var ReactCurrentActQueue = {
          current: null,
          // Used to reproduce behavior of `batchedUpdates` in legacy mode.
          isBatchingLegacy: false,
          didScheduleLegacyUpdate: false
        };
        var ReactCurrentOwner = {
          /**
           * @internal
           * @type {ReactComponent}
           */
          current: null
        };
        var ReactDebugCurrentFrame = {};
        var currentExtraStackFrame = null;
        function setExtraStackFrame(stack) {
          {
            currentExtraStackFrame = stack;
          }
        }
        {
          ReactDebugCurrentFrame.setExtraStackFrame = function(stack) {
            {
              currentExtraStackFrame = stack;
            }
          };
          ReactDebugCurrentFrame.getCurrentStack = null;
          ReactDebugCurrentFrame.getStackAddendum = function() {
            var stack = "";
            if (currentExtraStackFrame) {
              stack += currentExtraStackFrame;
            }
            var impl = ReactDebugCurrentFrame.getCurrentStack;
            if (impl) {
              stack += impl() || "";
            }
            return stack;
          };
        }
        var enableScopeAPI = false;
        var enableCacheElement = false;
        var enableTransitionTracing = false;
        var enableLegacyHidden = false;
        var enableDebugTracing = false;
        var ReactSharedInternals = {
          ReactCurrentDispatcher,
          ReactCurrentBatchConfig,
          ReactCurrentOwner
        };
        {
          ReactSharedInternals.ReactDebugCurrentFrame = ReactDebugCurrentFrame;
          ReactSharedInternals.ReactCurrentActQueue = ReactCurrentActQueue;
        }
        function warn(format) {
          {
            {
              for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
                args[_key - 1] = arguments[_key];
              }
              printWarning("warn", format, args);
            }
          }
        }
        function error(format) {
          {
            {
              for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
                args[_key2 - 1] = arguments[_key2];
              }
              printWarning("error", format, args);
            }
          }
        }
        function printWarning(level, format, args) {
          {
            var ReactDebugCurrentFrame2 = ReactSharedInternals.ReactDebugCurrentFrame;
            var stack = ReactDebugCurrentFrame2.getStackAddendum();
            if (stack !== "") {
              format += "%s";
              args = args.concat([stack]);
            }
            var argsWithFormat = args.map(function(item) {
              return String(item);
            });
            argsWithFormat.unshift("Warning: " + format);
            Function.prototype.apply.call(console[level], console, argsWithFormat);
          }
        }
        var didWarnStateUpdateForUnmountedComponent = {};
        function warnNoop(publicInstance, callerName) {
          {
            var _constructor = publicInstance.constructor;
            var componentName = _constructor && (_constructor.displayName || _constructor.name) || "ReactClass";
            var warningKey = componentName + "." + callerName;
            if (didWarnStateUpdateForUnmountedComponent[warningKey]) {
              return;
            }
            error("Can't call %s on a component that is not yet mounted. This is a no-op, but it might indicate a bug in your application. Instead, assign to `this.state` directly or define a `state = {};` class property with the desired state in the %s component.", callerName, componentName);
            didWarnStateUpdateForUnmountedComponent[warningKey] = true;
          }
        }
        var ReactNoopUpdateQueue = {
          /**
           * Checks whether or not this composite component is mounted.
           * @param {ReactClass} publicInstance The instance we want to test.
           * @return {boolean} True if mounted, false otherwise.
           * @protected
           * @final
           */
          isMounted: function(publicInstance) {
            return false;
          },
          /**
           * Forces an update. This should only be invoked when it is known with
           * certainty that we are **not** in a DOM transaction.
           *
           * You may want to call this when you know that some deeper aspect of the
           * component's state has changed but `setState` was not called.
           *
           * This will not invoke `shouldComponentUpdate`, but it will invoke
           * `componentWillUpdate` and `componentDidUpdate`.
           *
           * @param {ReactClass} publicInstance The instance that should rerender.
           * @param {?function} callback Called after component is updated.
           * @param {?string} callerName name of the calling function in the public API.
           * @internal
           */
          enqueueForceUpdate: function(publicInstance, callback, callerName) {
            warnNoop(publicInstance, "forceUpdate");
          },
          /**
           * Replaces all of the state. Always use this or `setState` to mutate state.
           * You should treat `this.state` as immutable.
           *
           * There is no guarantee that `this.state` will be immediately updated, so
           * accessing `this.state` after calling this method may return the old value.
           *
           * @param {ReactClass} publicInstance The instance that should rerender.
           * @param {object} completeState Next state.
           * @param {?function} callback Called after component is updated.
           * @param {?string} callerName name of the calling function in the public API.
           * @internal
           */
          enqueueReplaceState: function(publicInstance, completeState, callback, callerName) {
            warnNoop(publicInstance, "replaceState");
          },
          /**
           * Sets a subset of the state. This only exists because _pendingState is
           * internal. This provides a merging strategy that is not available to deep
           * properties which is confusing. TODO: Expose pendingState or don't use it
           * during the merge.
           *
           * @param {ReactClass} publicInstance The instance that should rerender.
           * @param {object} partialState Next partial state to be merged with state.
           * @param {?function} callback Called after component is updated.
           * @param {?string} Name of the calling function in the public API.
           * @internal
           */
          enqueueSetState: function(publicInstance, partialState, callback, callerName) {
            warnNoop(publicInstance, "setState");
          }
        };
        var assign = Object.assign;
        var emptyObject = {};
        {
          Object.freeze(emptyObject);
        }
        function Component(props, context, updater) {
          this.props = props;
          this.context = context;
          this.refs = emptyObject;
          this.updater = updater || ReactNoopUpdateQueue;
        }
        Component.prototype.isReactComponent = {};
        Component.prototype.setState = function(partialState, callback) {
          if (typeof partialState !== "object" && typeof partialState !== "function" && partialState != null) {
            throw new Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
          }
          this.updater.enqueueSetState(this, partialState, callback, "setState");
        };
        Component.prototype.forceUpdate = function(callback) {
          this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
        };
        {
          var deprecatedAPIs = {
            isMounted: ["isMounted", "Instead, make sure to clean up subscriptions and pending requests in componentWillUnmount to prevent memory leaks."],
            replaceState: ["replaceState", "Refactor your code to use setState instead (see https://github.com/facebook/react/issues/3236)."]
          };
          var defineDeprecationWarning = function(methodName, info) {
            Object.defineProperty(Component.prototype, methodName, {
              get: function() {
                warn("%s(...) is deprecated in plain JavaScript React classes. %s", info[0], info[1]);
                return void 0;
              }
            });
          };
          for (var fnName in deprecatedAPIs) {
            if (deprecatedAPIs.hasOwnProperty(fnName)) {
              defineDeprecationWarning(fnName, deprecatedAPIs[fnName]);
            }
          }
        }
        function ComponentDummy() {
        }
        ComponentDummy.prototype = Component.prototype;
        function PureComponent(props, context, updater) {
          this.props = props;
          this.context = context;
          this.refs = emptyObject;
          this.updater = updater || ReactNoopUpdateQueue;
        }
        var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
        pureComponentPrototype.constructor = PureComponent;
        assign(pureComponentPrototype, Component.prototype);
        pureComponentPrototype.isPureReactComponent = true;
        function createRef() {
          var refObject = {
            current: null
          };
          {
            Object.seal(refObject);
          }
          return refObject;
        }
        var isArrayImpl = Array.isArray;
        function isArray(a) {
          return isArrayImpl(a);
        }
        function typeName(value) {
          {
            var hasToStringTag = typeof Symbol === "function" && Symbol.toStringTag;
            var type = hasToStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
            return type;
          }
        }
        function willCoercionThrow(value) {
          {
            try {
              testStringCoercion(value);
              return false;
            } catch (e) {
              return true;
            }
          }
        }
        function testStringCoercion(value) {
          return "" + value;
        }
        function checkKeyStringCoercion(value) {
          {
            if (willCoercionThrow(value)) {
              error("The provided key is an unsupported type %s. This value must be coerced to a string before before using it here.", typeName(value));
              return testStringCoercion(value);
            }
          }
        }
        function getWrappedName(outerType, innerType, wrapperName) {
          var displayName = outerType.displayName;
          if (displayName) {
            return displayName;
          }
          var functionName = innerType.displayName || innerType.name || "";
          return functionName !== "" ? wrapperName + "(" + functionName + ")" : wrapperName;
        }
        function getContextName(type) {
          return type.displayName || "Context";
        }
        function getComponentNameFromType(type) {
          if (type == null) {
            return null;
          }
          {
            if (typeof type.tag === "number") {
              error("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue.");
            }
          }
          if (typeof type === "function") {
            return type.displayName || type.name || null;
          }
          if (typeof type === "string") {
            return type;
          }
          switch (type) {
            case REACT_FRAGMENT_TYPE:
              return "Fragment";
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_PROFILER_TYPE:
              return "Profiler";
            case REACT_STRICT_MODE_TYPE:
              return "StrictMode";
            case REACT_SUSPENSE_TYPE:
              return "Suspense";
            case REACT_SUSPENSE_LIST_TYPE:
              return "SuspenseList";
          }
          if (typeof type === "object") {
            switch (type.$$typeof) {
              case REACT_CONTEXT_TYPE:
                var context = type;
                return getContextName(context) + ".Consumer";
              case REACT_PROVIDER_TYPE:
                var provider = type;
                return getContextName(provider._context) + ".Provider";
              case REACT_FORWARD_REF_TYPE:
                return getWrappedName(type, type.render, "ForwardRef");
              case REACT_MEMO_TYPE:
                var outerName = type.displayName || null;
                if (outerName !== null) {
                  return outerName;
                }
                return getComponentNameFromType(type.type) || "Memo";
              case REACT_LAZY_TYPE: {
                var lazyComponent = type;
                var payload = lazyComponent._payload;
                var init = lazyComponent._init;
                try {
                  return getComponentNameFromType(init(payload));
                } catch (x) {
                  return null;
                }
              }
            }
          }
          return null;
        }
        var hasOwnProperty = Object.prototype.hasOwnProperty;
        var RESERVED_PROPS = {
          key: true,
          ref: true,
          __self: true,
          __source: true
        };
        var specialPropKeyWarningShown, specialPropRefWarningShown, didWarnAboutStringRefs;
        {
          didWarnAboutStringRefs = {};
        }
        function hasValidRef(config) {
          {
            if (hasOwnProperty.call(config, "ref")) {
              var getter = Object.getOwnPropertyDescriptor(config, "ref").get;
              if (getter && getter.isReactWarning) {
                return false;
              }
            }
          }
          return config.ref !== void 0;
        }
        function hasValidKey(config) {
          {
            if (hasOwnProperty.call(config, "key")) {
              var getter = Object.getOwnPropertyDescriptor(config, "key").get;
              if (getter && getter.isReactWarning) {
                return false;
              }
            }
          }
          return config.key !== void 0;
        }
        function defineKeyPropWarningGetter(props, displayName) {
          var warnAboutAccessingKey = function() {
            {
              if (!specialPropKeyWarningShown) {
                specialPropKeyWarningShown = true;
                error("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", displayName);
              }
            }
          };
          warnAboutAccessingKey.isReactWarning = true;
          Object.defineProperty(props, "key", {
            get: warnAboutAccessingKey,
            configurable: true
          });
        }
        function defineRefPropWarningGetter(props, displayName) {
          var warnAboutAccessingRef = function() {
            {
              if (!specialPropRefWarningShown) {
                specialPropRefWarningShown = true;
                error("%s: `ref` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", displayName);
              }
            }
          };
          warnAboutAccessingRef.isReactWarning = true;
          Object.defineProperty(props, "ref", {
            get: warnAboutAccessingRef,
            configurable: true
          });
        }
        function warnIfStringRefCannotBeAutoConverted(config) {
          {
            if (typeof config.ref === "string" && ReactCurrentOwner.current && config.__self && ReactCurrentOwner.current.stateNode !== config.__self) {
              var componentName = getComponentNameFromType(ReactCurrentOwner.current.type);
              if (!didWarnAboutStringRefs[componentName]) {
                error('Component "%s" contains the string ref "%s". Support for string refs will be removed in a future major release. This case cannot be automatically converted to an arrow function. We ask you to manually fix this case by using useRef() or createRef() instead. Learn more about using refs safely here: https://reactjs.org/link/strict-mode-string-ref', componentName, config.ref);
                didWarnAboutStringRefs[componentName] = true;
              }
            }
          }
        }
        var ReactElement = function(type, key, ref, self, source, owner, props) {
          var element = {
            // This tag allows us to uniquely identify this as a React Element
            $$typeof: REACT_ELEMENT_TYPE,
            // Built-in properties that belong on the element
            type,
            key,
            ref,
            props,
            // Record the component responsible for creating this element.
            _owner: owner
          };
          {
            element._store = {};
            Object.defineProperty(element._store, "validated", {
              configurable: false,
              enumerable: false,
              writable: true,
              value: false
            });
            Object.defineProperty(element, "_self", {
              configurable: false,
              enumerable: false,
              writable: false,
              value: self
            });
            Object.defineProperty(element, "_source", {
              configurable: false,
              enumerable: false,
              writable: false,
              value: source
            });
            if (Object.freeze) {
              Object.freeze(element.props);
              Object.freeze(element);
            }
          }
          return element;
        };
        function createElement(type, config, children) {
          var propName;
          var props = {};
          var key = null;
          var ref = null;
          var self = null;
          var source = null;
          if (config != null) {
            if (hasValidRef(config)) {
              ref = config.ref;
              {
                warnIfStringRefCannotBeAutoConverted(config);
              }
            }
            if (hasValidKey(config)) {
              {
                checkKeyStringCoercion(config.key);
              }
              key = "" + config.key;
            }
            self = config.__self === void 0 ? null : config.__self;
            source = config.__source === void 0 ? null : config.__source;
            for (propName in config) {
              if (hasOwnProperty.call(config, propName) && !RESERVED_PROPS.hasOwnProperty(propName)) {
                props[propName] = config[propName];
              }
            }
          }
          var childrenLength = arguments.length - 2;
          if (childrenLength === 1) {
            props.children = children;
          } else if (childrenLength > 1) {
            var childArray = Array(childrenLength);
            for (var i = 0; i < childrenLength; i++) {
              childArray[i] = arguments[i + 2];
            }
            {
              if (Object.freeze) {
                Object.freeze(childArray);
              }
            }
            props.children = childArray;
          }
          if (type && type.defaultProps) {
            var defaultProps = type.defaultProps;
            for (propName in defaultProps) {
              if (props[propName] === void 0) {
                props[propName] = defaultProps[propName];
              }
            }
          }
          {
            if (key || ref) {
              var displayName = typeof type === "function" ? type.displayName || type.name || "Unknown" : type;
              if (key) {
                defineKeyPropWarningGetter(props, displayName);
              }
              if (ref) {
                defineRefPropWarningGetter(props, displayName);
              }
            }
          }
          return ReactElement(type, key, ref, self, source, ReactCurrentOwner.current, props);
        }
        function cloneAndReplaceKey(oldElement, newKey) {
          var newElement = ReactElement(oldElement.type, newKey, oldElement.ref, oldElement._self, oldElement._source, oldElement._owner, oldElement.props);
          return newElement;
        }
        function cloneElement(element, config, children) {
          if (element === null || element === void 0) {
            throw new Error("React.cloneElement(...): The argument must be a React element, but you passed " + element + ".");
          }
          var propName;
          var props = assign({}, element.props);
          var key = element.key;
          var ref = element.ref;
          var self = element._self;
          var source = element._source;
          var owner = element._owner;
          if (config != null) {
            if (hasValidRef(config)) {
              ref = config.ref;
              owner = ReactCurrentOwner.current;
            }
            if (hasValidKey(config)) {
              {
                checkKeyStringCoercion(config.key);
              }
              key = "" + config.key;
            }
            var defaultProps;
            if (element.type && element.type.defaultProps) {
              defaultProps = element.type.defaultProps;
            }
            for (propName in config) {
              if (hasOwnProperty.call(config, propName) && !RESERVED_PROPS.hasOwnProperty(propName)) {
                if (config[propName] === void 0 && defaultProps !== void 0) {
                  props[propName] = defaultProps[propName];
                } else {
                  props[propName] = config[propName];
                }
              }
            }
          }
          var childrenLength = arguments.length - 2;
          if (childrenLength === 1) {
            props.children = children;
          } else if (childrenLength > 1) {
            var childArray = Array(childrenLength);
            for (var i = 0; i < childrenLength; i++) {
              childArray[i] = arguments[i + 2];
            }
            props.children = childArray;
          }
          return ReactElement(element.type, key, ref, self, source, owner, props);
        }
        function isValidElement(object) {
          return typeof object === "object" && object !== null && object.$$typeof === REACT_ELEMENT_TYPE;
        }
        var SEPARATOR = ".";
        var SUBSEPARATOR = ":";
        function escape(key) {
          var escapeRegex = /[=:]/g;
          var escaperLookup = {
            "=": "=0",
            ":": "=2"
          };
          var escapedString = key.replace(escapeRegex, function(match) {
            return escaperLookup[match];
          });
          return "$" + escapedString;
        }
        var didWarnAboutMaps = false;
        var userProvidedKeyEscapeRegex = /\/+/g;
        function escapeUserProvidedKey(text) {
          return text.replace(userProvidedKeyEscapeRegex, "$&/");
        }
        function getElementKey(element, index) {
          if (typeof element === "object" && element !== null && element.key != null) {
            {
              checkKeyStringCoercion(element.key);
            }
            return escape("" + element.key);
          }
          return index.toString(36);
        }
        function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
          var type = typeof children;
          if (type === "undefined" || type === "boolean") {
            children = null;
          }
          var invokeCallback = false;
          if (children === null) {
            invokeCallback = true;
          } else {
            switch (type) {
              case "string":
              case "number":
                invokeCallback = true;
                break;
              case "object":
                switch (children.$$typeof) {
                  case REACT_ELEMENT_TYPE:
                  case REACT_PORTAL_TYPE:
                    invokeCallback = true;
                }
            }
          }
          if (invokeCallback) {
            var _child = children;
            var mappedChild = callback(_child);
            var childKey = nameSoFar === "" ? SEPARATOR + getElementKey(_child, 0) : nameSoFar;
            if (isArray(mappedChild)) {
              var escapedChildKey = "";
              if (childKey != null) {
                escapedChildKey = escapeUserProvidedKey(childKey) + "/";
              }
              mapIntoArray(mappedChild, array, escapedChildKey, "", function(c) {
                return c;
              });
            } else if (mappedChild != null) {
              if (isValidElement(mappedChild)) {
                {
                  if (mappedChild.key && (!_child || _child.key !== mappedChild.key)) {
                    checkKeyStringCoercion(mappedChild.key);
                  }
                }
                mappedChild = cloneAndReplaceKey(
                  mappedChild,
                  // Keep both the (mapped) and old keys if they differ, just as
                  // traverseAllChildren used to do for objects as children
                  escapedPrefix + // $FlowFixMe Flow incorrectly thinks React.Portal doesn't have a key
                  (mappedChild.key && (!_child || _child.key !== mappedChild.key) ? (
                    // $FlowFixMe Flow incorrectly thinks existing element's key can be a number
                    // eslint-disable-next-line react-internal/safe-string-coercion
                    escapeUserProvidedKey("" + mappedChild.key) + "/"
                  ) : "") + childKey
                );
              }
              array.push(mappedChild);
            }
            return 1;
          }
          var child;
          var nextName;
          var subtreeCount = 0;
          var nextNamePrefix = nameSoFar === "" ? SEPARATOR : nameSoFar + SUBSEPARATOR;
          if (isArray(children)) {
            for (var i = 0; i < children.length; i++) {
              child = children[i];
              nextName = nextNamePrefix + getElementKey(child, i);
              subtreeCount += mapIntoArray(child, array, escapedPrefix, nextName, callback);
            }
          } else {
            var iteratorFn = getIteratorFn(children);
            if (typeof iteratorFn === "function") {
              var iterableChildren = children;
              {
                if (iteratorFn === iterableChildren.entries) {
                  if (!didWarnAboutMaps) {
                    warn("Using Maps as children is not supported. Use an array of keyed ReactElements instead.");
                  }
                  didWarnAboutMaps = true;
                }
              }
              var iterator = iteratorFn.call(iterableChildren);
              var step;
              var ii = 0;
              while (!(step = iterator.next()).done) {
                child = step.value;
                nextName = nextNamePrefix + getElementKey(child, ii++);
                subtreeCount += mapIntoArray(child, array, escapedPrefix, nextName, callback);
              }
            } else if (type === "object") {
              var childrenString = String(children);
              throw new Error("Objects are not valid as a React child (found: " + (childrenString === "[object Object]" ? "object with keys {" + Object.keys(children).join(", ") + "}" : childrenString) + "). If you meant to render a collection of children, use an array instead.");
            }
          }
          return subtreeCount;
        }
        function mapChildren(children, func, context) {
          if (children == null) {
            return children;
          }
          var result = [];
          var count = 0;
          mapIntoArray(children, result, "", "", function(child) {
            return func.call(context, child, count++);
          });
          return result;
        }
        function countChildren(children) {
          var n = 0;
          mapChildren(children, function() {
            n++;
          });
          return n;
        }
        function forEachChildren(children, forEachFunc, forEachContext) {
          mapChildren(children, function() {
            forEachFunc.apply(this, arguments);
          }, forEachContext);
        }
        function toArray(children) {
          return mapChildren(children, function(child) {
            return child;
          }) || [];
        }
        function onlyChild(children) {
          if (!isValidElement(children)) {
            throw new Error("React.Children.only expected to receive a single React element child.");
          }
          return children;
        }
        function createContext(defaultValue) {
          var context = {
            $$typeof: REACT_CONTEXT_TYPE,
            // As a workaround to support multiple concurrent renderers, we categorize
            // some renderers as primary and others as secondary. We only expect
            // there to be two concurrent renderers at most: React Native (primary) and
            // Fabric (secondary); React DOM (primary) and React ART (secondary).
            // Secondary renderers store their context values on separate fields.
            _currentValue: defaultValue,
            _currentValue2: defaultValue,
            // Used to track how many concurrent renderers this context currently
            // supports within in a single renderer. Such as parallel server rendering.
            _threadCount: 0,
            // These are circular
            Provider: null,
            Consumer: null,
            // Add these to use same hidden class in VM as ServerContext
            _defaultValue: null,
            _globalName: null
          };
          context.Provider = {
            $$typeof: REACT_PROVIDER_TYPE,
            _context: context
          };
          var hasWarnedAboutUsingNestedContextConsumers = false;
          var hasWarnedAboutUsingConsumerProvider = false;
          var hasWarnedAboutDisplayNameOnConsumer = false;
          {
            var Consumer = {
              $$typeof: REACT_CONTEXT_TYPE,
              _context: context
            };
            Object.defineProperties(Consumer, {
              Provider: {
                get: function() {
                  if (!hasWarnedAboutUsingConsumerProvider) {
                    hasWarnedAboutUsingConsumerProvider = true;
                    error("Rendering <Context.Consumer.Provider> is not supported and will be removed in a future major release. Did you mean to render <Context.Provider> instead?");
                  }
                  return context.Provider;
                },
                set: function(_Provider) {
                  context.Provider = _Provider;
                }
              },
              _currentValue: {
                get: function() {
                  return context._currentValue;
                },
                set: function(_currentValue) {
                  context._currentValue = _currentValue;
                }
              },
              _currentValue2: {
                get: function() {
                  return context._currentValue2;
                },
                set: function(_currentValue2) {
                  context._currentValue2 = _currentValue2;
                }
              },
              _threadCount: {
                get: function() {
                  return context._threadCount;
                },
                set: function(_threadCount) {
                  context._threadCount = _threadCount;
                }
              },
              Consumer: {
                get: function() {
                  if (!hasWarnedAboutUsingNestedContextConsumers) {
                    hasWarnedAboutUsingNestedContextConsumers = true;
                    error("Rendering <Context.Consumer.Consumer> is not supported and will be removed in a future major release. Did you mean to render <Context.Consumer> instead?");
                  }
                  return context.Consumer;
                }
              },
              displayName: {
                get: function() {
                  return context.displayName;
                },
                set: function(displayName) {
                  if (!hasWarnedAboutDisplayNameOnConsumer) {
                    warn("Setting `displayName` on Context.Consumer has no effect. You should set it directly on the context with Context.displayName = '%s'.", displayName);
                    hasWarnedAboutDisplayNameOnConsumer = true;
                  }
                }
              }
            });
            context.Consumer = Consumer;
          }
          {
            context._currentRenderer = null;
            context._currentRenderer2 = null;
          }
          return context;
        }
        var Uninitialized = -1;
        var Pending = 0;
        var Resolved = 1;
        var Rejected = 2;
        function lazyInitializer(payload) {
          if (payload._status === Uninitialized) {
            var ctor = payload._result;
            var thenable = ctor();
            thenable.then(function(moduleObject2) {
              if (payload._status === Pending || payload._status === Uninitialized) {
                var resolved = payload;
                resolved._status = Resolved;
                resolved._result = moduleObject2;
              }
            }, function(error2) {
              if (payload._status === Pending || payload._status === Uninitialized) {
                var rejected = payload;
                rejected._status = Rejected;
                rejected._result = error2;
              }
            });
            if (payload._status === Uninitialized) {
              var pending = payload;
              pending._status = Pending;
              pending._result = thenable;
            }
          }
          if (payload._status === Resolved) {
            var moduleObject = payload._result;
            {
              if (moduleObject === void 0) {
                error("lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))\n\nDid you accidentally put curly braces around the import?", moduleObject);
              }
            }
            {
              if (!("default" in moduleObject)) {
                error("lazy: Expected the result of a dynamic import() call. Instead received: %s\n\nYour code should look like: \n  const MyComponent = lazy(() => import('./MyComponent'))", moduleObject);
              }
            }
            return moduleObject.default;
          } else {
            throw payload._result;
          }
        }
        function lazy(ctor) {
          var payload = {
            // We use these fields to store the result.
            _status: Uninitialized,
            _result: ctor
          };
          var lazyType = {
            $$typeof: REACT_LAZY_TYPE,
            _payload: payload,
            _init: lazyInitializer
          };
          {
            var defaultProps;
            var propTypes;
            Object.defineProperties(lazyType, {
              defaultProps: {
                configurable: true,
                get: function() {
                  return defaultProps;
                },
                set: function(newDefaultProps) {
                  error("React.lazy(...): It is not supported to assign `defaultProps` to a lazy component import. Either specify them where the component is defined, or create a wrapping component around it.");
                  defaultProps = newDefaultProps;
                  Object.defineProperty(lazyType, "defaultProps", {
                    enumerable: true
                  });
                }
              },
              propTypes: {
                configurable: true,
                get: function() {
                  return propTypes;
                },
                set: function(newPropTypes) {
                  error("React.lazy(...): It is not supported to assign `propTypes` to a lazy component import. Either specify them where the component is defined, or create a wrapping component around it.");
                  propTypes = newPropTypes;
                  Object.defineProperty(lazyType, "propTypes", {
                    enumerable: true
                  });
                }
              }
            });
          }
          return lazyType;
        }
        function forwardRef(render) {
          {
            if (render != null && render.$$typeof === REACT_MEMO_TYPE) {
              error("forwardRef requires a render function but received a `memo` component. Instead of forwardRef(memo(...)), use memo(forwardRef(...)).");
            } else if (typeof render !== "function") {
              error("forwardRef requires a render function but was given %s.", render === null ? "null" : typeof render);
            } else {
              if (render.length !== 0 && render.length !== 2) {
                error("forwardRef render functions accept exactly two parameters: props and ref. %s", render.length === 1 ? "Did you forget to use the ref parameter?" : "Any additional parameter will be undefined.");
              }
            }
            if (render != null) {
              if (render.defaultProps != null || render.propTypes != null) {
                error("forwardRef render functions do not support propTypes or defaultProps. Did you accidentally pass a React component?");
              }
            }
          }
          var elementType = {
            $$typeof: REACT_FORWARD_REF_TYPE,
            render
          };
          {
            var ownName;
            Object.defineProperty(elementType, "displayName", {
              enumerable: false,
              configurable: true,
              get: function() {
                return ownName;
              },
              set: function(name) {
                ownName = name;
                if (!render.name && !render.displayName) {
                  render.displayName = name;
                }
              }
            });
          }
          return elementType;
        }
        var REACT_MODULE_REFERENCE;
        {
          REACT_MODULE_REFERENCE = /* @__PURE__ */ Symbol.for("react.module.reference");
        }
        function isValidElementType(type) {
          if (typeof type === "string" || typeof type === "function") {
            return true;
          }
          if (type === REACT_FRAGMENT_TYPE || type === REACT_PROFILER_TYPE || enableDebugTracing || type === REACT_STRICT_MODE_TYPE || type === REACT_SUSPENSE_TYPE || type === REACT_SUSPENSE_LIST_TYPE || enableLegacyHidden || type === REACT_OFFSCREEN_TYPE || enableScopeAPI || enableCacheElement || enableTransitionTracing) {
            return true;
          }
          if (typeof type === "object" && type !== null) {
            if (type.$$typeof === REACT_LAZY_TYPE || type.$$typeof === REACT_MEMO_TYPE || type.$$typeof === REACT_PROVIDER_TYPE || type.$$typeof === REACT_CONTEXT_TYPE || type.$$typeof === REACT_FORWARD_REF_TYPE || // This needs to include all possible module reference object
            // types supported by any Flight configuration anywhere since
            // we don't know which Flight build this will end up being used
            // with.
            type.$$typeof === REACT_MODULE_REFERENCE || type.getModuleId !== void 0) {
              return true;
            }
          }
          return false;
        }
        function memo(type, compare) {
          {
            if (!isValidElementType(type)) {
              error("memo: The first argument must be a component. Instead received: %s", type === null ? "null" : typeof type);
            }
          }
          var elementType = {
            $$typeof: REACT_MEMO_TYPE,
            type,
            compare: compare === void 0 ? null : compare
          };
          {
            var ownName;
            Object.defineProperty(elementType, "displayName", {
              enumerable: false,
              configurable: true,
              get: function() {
                return ownName;
              },
              set: function(name) {
                ownName = name;
                if (!type.name && !type.displayName) {
                  type.displayName = name;
                }
              }
            });
          }
          return elementType;
        }
        function resolveDispatcher() {
          var dispatcher = ReactCurrentDispatcher.current;
          {
            if (dispatcher === null) {
              error("Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://reactjs.org/link/invalid-hook-call for tips about how to debug and fix this problem.");
            }
          }
          return dispatcher;
        }
        function useContext(Context) {
          var dispatcher = resolveDispatcher();
          {
            if (Context._context !== void 0) {
              var realContext = Context._context;
              if (realContext.Consumer === Context) {
                error("Calling useContext(Context.Consumer) is not supported, may cause bugs, and will be removed in a future major release. Did you mean to call useContext(Context) instead?");
              } else if (realContext.Provider === Context) {
                error("Calling useContext(Context.Provider) is not supported. Did you mean to call useContext(Context) instead?");
              }
            }
          }
          return dispatcher.useContext(Context);
        }
        function useState(initialState) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useState(initialState);
        }
        function useReducer(reducer, initialArg, init) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useReducer(reducer, initialArg, init);
        }
        function useRef(initialValue) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useRef(initialValue);
        }
        function useEffect(create, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useEffect(create, deps);
        }
        function useInsertionEffect(create, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useInsertionEffect(create, deps);
        }
        function useLayoutEffect(create, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useLayoutEffect(create, deps);
        }
        function useCallback(callback, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useCallback(callback, deps);
        }
        function useMemo(create, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useMemo(create, deps);
        }
        function useImperativeHandle(ref, create, deps) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useImperativeHandle(ref, create, deps);
        }
        function useDebugValue(value, formatterFn) {
          {
            var dispatcher = resolveDispatcher();
            return dispatcher.useDebugValue(value, formatterFn);
          }
        }
        function useTransition() {
          var dispatcher = resolveDispatcher();
          return dispatcher.useTransition();
        }
        function useDeferredValue(value) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useDeferredValue(value);
        }
        function useId() {
          var dispatcher = resolveDispatcher();
          return dispatcher.useId();
        }
        function useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
          var dispatcher = resolveDispatcher();
          return dispatcher.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
        }
        var disabledDepth = 0;
        var prevLog;
        var prevInfo;
        var prevWarn;
        var prevError;
        var prevGroup;
        var prevGroupCollapsed;
        var prevGroupEnd;
        function disabledLog() {
        }
        disabledLog.__reactDisabledLog = true;
        function disableLogs() {
          {
            if (disabledDepth === 0) {
              prevLog = console.log;
              prevInfo = console.info;
              prevWarn = console.warn;
              prevError = console.error;
              prevGroup = console.group;
              prevGroupCollapsed = console.groupCollapsed;
              prevGroupEnd = console.groupEnd;
              var props = {
                configurable: true,
                enumerable: true,
                value: disabledLog,
                writable: true
              };
              Object.defineProperties(console, {
                info: props,
                log: props,
                warn: props,
                error: props,
                group: props,
                groupCollapsed: props,
                groupEnd: props
              });
            }
            disabledDepth++;
          }
        }
        function reenableLogs() {
          {
            disabledDepth--;
            if (disabledDepth === 0) {
              var props = {
                configurable: true,
                enumerable: true,
                writable: true
              };
              Object.defineProperties(console, {
                log: assign({}, props, {
                  value: prevLog
                }),
                info: assign({}, props, {
                  value: prevInfo
                }),
                warn: assign({}, props, {
                  value: prevWarn
                }),
                error: assign({}, props, {
                  value: prevError
                }),
                group: assign({}, props, {
                  value: prevGroup
                }),
                groupCollapsed: assign({}, props, {
                  value: prevGroupCollapsed
                }),
                groupEnd: assign({}, props, {
                  value: prevGroupEnd
                })
              });
            }
            if (disabledDepth < 0) {
              error("disabledDepth fell below zero. This is a bug in React. Please file an issue.");
            }
          }
        }
        var ReactCurrentDispatcher$1 = ReactSharedInternals.ReactCurrentDispatcher;
        var prefix;
        function describeBuiltInComponentFrame(name, source, ownerFn) {
          {
            if (prefix === void 0) {
              try {
                throw Error();
              } catch (x) {
                var match = x.stack.trim().match(/\n( *(at )?)/);
                prefix = match && match[1] || "";
              }
            }
            return "\n" + prefix + name;
          }
        }
        var reentry = false;
        var componentFrameCache;
        {
          var PossiblyWeakMap = typeof WeakMap === "function" ? WeakMap : Map;
          componentFrameCache = new PossiblyWeakMap();
        }
        function describeNativeComponentFrame(fn, construct) {
          if (!fn || reentry) {
            return "";
          }
          {
            var frame = componentFrameCache.get(fn);
            if (frame !== void 0) {
              return frame;
            }
          }
          var control;
          reentry = true;
          var previousPrepareStackTrace = Error.prepareStackTrace;
          Error.prepareStackTrace = void 0;
          var previousDispatcher;
          {
            previousDispatcher = ReactCurrentDispatcher$1.current;
            ReactCurrentDispatcher$1.current = null;
            disableLogs();
          }
          try {
            if (construct) {
              var Fake = function() {
                throw Error();
              };
              Object.defineProperty(Fake.prototype, "props", {
                set: function() {
                  throw Error();
                }
              });
              if (typeof Reflect === "object" && Reflect.construct) {
                try {
                  Reflect.construct(Fake, []);
                } catch (x) {
                  control = x;
                }
                Reflect.construct(fn, [], Fake);
              } else {
                try {
                  Fake.call();
                } catch (x) {
                  control = x;
                }
                fn.call(Fake.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (x) {
                control = x;
              }
              fn();
            }
          } catch (sample) {
            if (sample && control && typeof sample.stack === "string") {
              var sampleLines = sample.stack.split("\n");
              var controlLines = control.stack.split("\n");
              var s = sampleLines.length - 1;
              var c = controlLines.length - 1;
              while (s >= 1 && c >= 0 && sampleLines[s] !== controlLines[c]) {
                c--;
              }
              for (; s >= 1 && c >= 0; s--, c--) {
                if (sampleLines[s] !== controlLines[c]) {
                  if (s !== 1 || c !== 1) {
                    do {
                      s--;
                      c--;
                      if (c < 0 || sampleLines[s] !== controlLines[c]) {
                        var _frame = "\n" + sampleLines[s].replace(" at new ", " at ");
                        if (fn.displayName && _frame.includes("<anonymous>")) {
                          _frame = _frame.replace("<anonymous>", fn.displayName);
                        }
                        {
                          if (typeof fn === "function") {
                            componentFrameCache.set(fn, _frame);
                          }
                        }
                        return _frame;
                      }
                    } while (s >= 1 && c >= 0);
                  }
                  break;
                }
              }
            }
          } finally {
            reentry = false;
            {
              ReactCurrentDispatcher$1.current = previousDispatcher;
              reenableLogs();
            }
            Error.prepareStackTrace = previousPrepareStackTrace;
          }
          var name = fn ? fn.displayName || fn.name : "";
          var syntheticFrame = name ? describeBuiltInComponentFrame(name) : "";
          {
            if (typeof fn === "function") {
              componentFrameCache.set(fn, syntheticFrame);
            }
          }
          return syntheticFrame;
        }
        function describeFunctionComponentFrame(fn, source, ownerFn) {
          {
            return describeNativeComponentFrame(fn, false);
          }
        }
        function shouldConstruct(Component2) {
          var prototype = Component2.prototype;
          return !!(prototype && prototype.isReactComponent);
        }
        function describeUnknownElementTypeFrameInDEV(type, source, ownerFn) {
          if (type == null) {
            return "";
          }
          if (typeof type === "function") {
            {
              return describeNativeComponentFrame(type, shouldConstruct(type));
            }
          }
          if (typeof type === "string") {
            return describeBuiltInComponentFrame(type);
          }
          switch (type) {
            case REACT_SUSPENSE_TYPE:
              return describeBuiltInComponentFrame("Suspense");
            case REACT_SUSPENSE_LIST_TYPE:
              return describeBuiltInComponentFrame("SuspenseList");
          }
          if (typeof type === "object") {
            switch (type.$$typeof) {
              case REACT_FORWARD_REF_TYPE:
                return describeFunctionComponentFrame(type.render);
              case REACT_MEMO_TYPE:
                return describeUnknownElementTypeFrameInDEV(type.type, source, ownerFn);
              case REACT_LAZY_TYPE: {
                var lazyComponent = type;
                var payload = lazyComponent._payload;
                var init = lazyComponent._init;
                try {
                  return describeUnknownElementTypeFrameInDEV(init(payload), source, ownerFn);
                } catch (x) {
                }
              }
            }
          }
          return "";
        }
        var loggedTypeFailures = {};
        var ReactDebugCurrentFrame$1 = ReactSharedInternals.ReactDebugCurrentFrame;
        function setCurrentlyValidatingElement(element) {
          {
            if (element) {
              var owner = element._owner;
              var stack = describeUnknownElementTypeFrameInDEV(element.type, element._source, owner ? owner.type : null);
              ReactDebugCurrentFrame$1.setExtraStackFrame(stack);
            } else {
              ReactDebugCurrentFrame$1.setExtraStackFrame(null);
            }
          }
        }
        function checkPropTypes(typeSpecs, values, location, componentName, element) {
          {
            var has = Function.call.bind(hasOwnProperty);
            for (var typeSpecName in typeSpecs) {
              if (has(typeSpecs, typeSpecName)) {
                var error$1 = void 0;
                try {
                  if (typeof typeSpecs[typeSpecName] !== "function") {
                    var err = Error((componentName || "React class") + ": " + location + " type `" + typeSpecName + "` is invalid; it must be a function, usually from the `prop-types` package, but received `" + typeof typeSpecs[typeSpecName] + "`.This often happens because of typos such as `PropTypes.function` instead of `PropTypes.func`.");
                    err.name = "Invariant Violation";
                    throw err;
                  }
                  error$1 = typeSpecs[typeSpecName](values, typeSpecName, componentName, location, null, "SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED");
                } catch (ex) {
                  error$1 = ex;
                }
                if (error$1 && !(error$1 instanceof Error)) {
                  setCurrentlyValidatingElement(element);
                  error("%s: type specification of %s `%s` is invalid; the type checker function must return `null` or an `Error` but returned a %s. You may have forgotten to pass an argument to the type checker creator (arrayOf, instanceOf, objectOf, oneOf, oneOfType, and shape all require an argument).", componentName || "React class", location, typeSpecName, typeof error$1);
                  setCurrentlyValidatingElement(null);
                }
                if (error$1 instanceof Error && !(error$1.message in loggedTypeFailures)) {
                  loggedTypeFailures[error$1.message] = true;
                  setCurrentlyValidatingElement(element);
                  error("Failed %s type: %s", location, error$1.message);
                  setCurrentlyValidatingElement(null);
                }
              }
            }
          }
        }
        function setCurrentlyValidatingElement$1(element) {
          {
            if (element) {
              var owner = element._owner;
              var stack = describeUnknownElementTypeFrameInDEV(element.type, element._source, owner ? owner.type : null);
              setExtraStackFrame(stack);
            } else {
              setExtraStackFrame(null);
            }
          }
        }
        var propTypesMisspellWarningShown;
        {
          propTypesMisspellWarningShown = false;
        }
        function getDeclarationErrorAddendum() {
          if (ReactCurrentOwner.current) {
            var name = getComponentNameFromType(ReactCurrentOwner.current.type);
            if (name) {
              return "\n\nCheck the render method of `" + name + "`.";
            }
          }
          return "";
        }
        function getSourceInfoErrorAddendum(source) {
          if (source !== void 0) {
            var fileName = source.fileName.replace(/^.*[\\\/]/, "");
            var lineNumber = source.lineNumber;
            return "\n\nCheck your code at " + fileName + ":" + lineNumber + ".";
          }
          return "";
        }
        function getSourceInfoErrorAddendumForProps(elementProps) {
          if (elementProps !== null && elementProps !== void 0) {
            return getSourceInfoErrorAddendum(elementProps.__source);
          }
          return "";
        }
        var ownerHasKeyUseWarning = {};
        function getCurrentComponentErrorInfo(parentType) {
          var info = getDeclarationErrorAddendum();
          if (!info) {
            var parentName = typeof parentType === "string" ? parentType : parentType.displayName || parentType.name;
            if (parentName) {
              info = "\n\nCheck the top-level render call using <" + parentName + ">.";
            }
          }
          return info;
        }
        function validateExplicitKey(element, parentType) {
          if (!element._store || element._store.validated || element.key != null) {
            return;
          }
          element._store.validated = true;
          var currentComponentErrorInfo = getCurrentComponentErrorInfo(parentType);
          if (ownerHasKeyUseWarning[currentComponentErrorInfo]) {
            return;
          }
          ownerHasKeyUseWarning[currentComponentErrorInfo] = true;
          var childOwner = "";
          if (element && element._owner && element._owner !== ReactCurrentOwner.current) {
            childOwner = " It was passed a child from " + getComponentNameFromType(element._owner.type) + ".";
          }
          {
            setCurrentlyValidatingElement$1(element);
            error('Each child in a list should have a unique "key" prop.%s%s See https://reactjs.org/link/warning-keys for more information.', currentComponentErrorInfo, childOwner);
            setCurrentlyValidatingElement$1(null);
          }
        }
        function validateChildKeys(node, parentType) {
          if (typeof node !== "object") {
            return;
          }
          if (isArray(node)) {
            for (var i = 0; i < node.length; i++) {
              var child = node[i];
              if (isValidElement(child)) {
                validateExplicitKey(child, parentType);
              }
            }
          } else if (isValidElement(node)) {
            if (node._store) {
              node._store.validated = true;
            }
          } else if (node) {
            var iteratorFn = getIteratorFn(node);
            if (typeof iteratorFn === "function") {
              if (iteratorFn !== node.entries) {
                var iterator = iteratorFn.call(node);
                var step;
                while (!(step = iterator.next()).done) {
                  if (isValidElement(step.value)) {
                    validateExplicitKey(step.value, parentType);
                  }
                }
              }
            }
          }
        }
        function validatePropTypes(element) {
          {
            var type = element.type;
            if (type === null || type === void 0 || typeof type === "string") {
              return;
            }
            var propTypes;
            if (typeof type === "function") {
              propTypes = type.propTypes;
            } else if (typeof type === "object" && (type.$$typeof === REACT_FORWARD_REF_TYPE || // Note: Memo only checks outer props here.
            // Inner props are checked in the reconciler.
            type.$$typeof === REACT_MEMO_TYPE)) {
              propTypes = type.propTypes;
            } else {
              return;
            }
            if (propTypes) {
              var name = getComponentNameFromType(type);
              checkPropTypes(propTypes, element.props, "prop", name, element);
            } else if (type.PropTypes !== void 0 && !propTypesMisspellWarningShown) {
              propTypesMisspellWarningShown = true;
              var _name = getComponentNameFromType(type);
              error("Component %s declared `PropTypes` instead of `propTypes`. Did you misspell the property assignment?", _name || "Unknown");
            }
            if (typeof type.getDefaultProps === "function" && !type.getDefaultProps.isReactClassApproved) {
              error("getDefaultProps is only used on classic React.createClass definitions. Use a static property named `defaultProps` instead.");
            }
          }
        }
        function validateFragmentProps(fragment) {
          {
            var keys = Object.keys(fragment.props);
            for (var i = 0; i < keys.length; i++) {
              var key = keys[i];
              if (key !== "children" && key !== "key") {
                setCurrentlyValidatingElement$1(fragment);
                error("Invalid prop `%s` supplied to `React.Fragment`. React.Fragment can only have `key` and `children` props.", key);
                setCurrentlyValidatingElement$1(null);
                break;
              }
            }
            if (fragment.ref !== null) {
              setCurrentlyValidatingElement$1(fragment);
              error("Invalid attribute `ref` supplied to `React.Fragment`.");
              setCurrentlyValidatingElement$1(null);
            }
          }
        }
        function createElementWithValidation(type, props, children) {
          var validType = isValidElementType(type);
          if (!validType) {
            var info = "";
            if (type === void 0 || typeof type === "object" && type !== null && Object.keys(type).length === 0) {
              info += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.";
            }
            var sourceInfo = getSourceInfoErrorAddendumForProps(props);
            if (sourceInfo) {
              info += sourceInfo;
            } else {
              info += getDeclarationErrorAddendum();
            }
            var typeString;
            if (type === null) {
              typeString = "null";
            } else if (isArray(type)) {
              typeString = "array";
            } else if (type !== void 0 && type.$$typeof === REACT_ELEMENT_TYPE) {
              typeString = "<" + (getComponentNameFromType(type.type) || "Unknown") + " />";
              info = " Did you accidentally export a JSX literal instead of a component?";
            } else {
              typeString = typeof type;
            }
            {
              error("React.createElement: type is invalid -- expected a string (for built-in components) or a class/function (for composite components) but got: %s.%s", typeString, info);
            }
          }
          var element = createElement.apply(this, arguments);
          if (element == null) {
            return element;
          }
          if (validType) {
            for (var i = 2; i < arguments.length; i++) {
              validateChildKeys(arguments[i], type);
            }
          }
          if (type === REACT_FRAGMENT_TYPE) {
            validateFragmentProps(element);
          } else {
            validatePropTypes(element);
          }
          return element;
        }
        var didWarnAboutDeprecatedCreateFactory = false;
        function createFactoryWithValidation(type) {
          var validatedFactory = createElementWithValidation.bind(null, type);
          validatedFactory.type = type;
          {
            if (!didWarnAboutDeprecatedCreateFactory) {
              didWarnAboutDeprecatedCreateFactory = true;
              warn("React.createFactory() is deprecated and will be removed in a future major release. Consider using JSX or use React.createElement() directly instead.");
            }
            Object.defineProperty(validatedFactory, "type", {
              enumerable: false,
              get: function() {
                warn("Factory.type is deprecated. Access the class directly before passing it to createFactory.");
                Object.defineProperty(this, "type", {
                  value: type
                });
                return type;
              }
            });
          }
          return validatedFactory;
        }
        function cloneElementWithValidation(element, props, children) {
          var newElement = cloneElement.apply(this, arguments);
          for (var i = 2; i < arguments.length; i++) {
            validateChildKeys(arguments[i], newElement.type);
          }
          validatePropTypes(newElement);
          return newElement;
        }
        function startTransition(scope, options) {
          var prevTransition = ReactCurrentBatchConfig.transition;
          ReactCurrentBatchConfig.transition = {};
          var currentTransition = ReactCurrentBatchConfig.transition;
          {
            ReactCurrentBatchConfig.transition._updatedFibers = /* @__PURE__ */ new Set();
          }
          try {
            scope();
          } finally {
            ReactCurrentBatchConfig.transition = prevTransition;
            {
              if (prevTransition === null && currentTransition._updatedFibers) {
                var updatedFibersCount = currentTransition._updatedFibers.size;
                if (updatedFibersCount > 10) {
                  warn("Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table.");
                }
                currentTransition._updatedFibers.clear();
              }
            }
          }
        }
        var didWarnAboutMessageChannel = false;
        var enqueueTaskImpl = null;
        function enqueueTask(task) {
          if (enqueueTaskImpl === null) {
            try {
              var requireString = ("require" + Math.random()).slice(0, 7);
              var nodeRequire = module2 && module2[requireString];
              enqueueTaskImpl = nodeRequire.call(module2, "timers").setImmediate;
            } catch (_err) {
              enqueueTaskImpl = function(callback) {
                {
                  if (didWarnAboutMessageChannel === false) {
                    didWarnAboutMessageChannel = true;
                    if (typeof MessageChannel === "undefined") {
                      error("This browser does not have a MessageChannel implementation, so enqueuing tasks via await act(async () => ...) will fail. Please file an issue at https://github.com/facebook/react/issues if you encounter this warning.");
                    }
                  }
                }
                var channel = new MessageChannel();
                channel.port1.onmessage = callback;
                channel.port2.postMessage(void 0);
              };
            }
          }
          return enqueueTaskImpl(task);
        }
        var actScopeDepth = 0;
        var didWarnNoAwaitAct = false;
        function act(callback) {
          {
            var prevActScopeDepth = actScopeDepth;
            actScopeDepth++;
            if (ReactCurrentActQueue.current === null) {
              ReactCurrentActQueue.current = [];
            }
            var prevIsBatchingLegacy = ReactCurrentActQueue.isBatchingLegacy;
            var result;
            try {
              ReactCurrentActQueue.isBatchingLegacy = true;
              result = callback();
              if (!prevIsBatchingLegacy && ReactCurrentActQueue.didScheduleLegacyUpdate) {
                var queue = ReactCurrentActQueue.current;
                if (queue !== null) {
                  ReactCurrentActQueue.didScheduleLegacyUpdate = false;
                  flushActQueue(queue);
                }
              }
            } catch (error2) {
              popActScope(prevActScopeDepth);
              throw error2;
            } finally {
              ReactCurrentActQueue.isBatchingLegacy = prevIsBatchingLegacy;
            }
            if (result !== null && typeof result === "object" && typeof result.then === "function") {
              var thenableResult = result;
              var wasAwaited = false;
              var thenable = {
                then: function(resolve, reject) {
                  wasAwaited = true;
                  thenableResult.then(function(returnValue2) {
                    popActScope(prevActScopeDepth);
                    if (actScopeDepth === 0) {
                      recursivelyFlushAsyncActWork(returnValue2, resolve, reject);
                    } else {
                      resolve(returnValue2);
                    }
                  }, function(error2) {
                    popActScope(prevActScopeDepth);
                    reject(error2);
                  });
                }
              };
              {
                if (!didWarnNoAwaitAct && typeof Promise !== "undefined") {
                  Promise.resolve().then(function() {
                  }).then(function() {
                    if (!wasAwaited) {
                      didWarnNoAwaitAct = true;
                      error("You called act(async () => ...) without await. This could lead to unexpected testing behaviour, interleaving multiple act calls and mixing their scopes. You should - await act(async () => ...);");
                    }
                  });
                }
              }
              return thenable;
            } else {
              var returnValue = result;
              popActScope(prevActScopeDepth);
              if (actScopeDepth === 0) {
                var _queue = ReactCurrentActQueue.current;
                if (_queue !== null) {
                  flushActQueue(_queue);
                  ReactCurrentActQueue.current = null;
                }
                var _thenable = {
                  then: function(resolve, reject) {
                    if (ReactCurrentActQueue.current === null) {
                      ReactCurrentActQueue.current = [];
                      recursivelyFlushAsyncActWork(returnValue, resolve, reject);
                    } else {
                      resolve(returnValue);
                    }
                  }
                };
                return _thenable;
              } else {
                var _thenable2 = {
                  then: function(resolve, reject) {
                    resolve(returnValue);
                  }
                };
                return _thenable2;
              }
            }
          }
        }
        function popActScope(prevActScopeDepth) {
          {
            if (prevActScopeDepth !== actScopeDepth - 1) {
              error("You seem to have overlapping act() calls, this is not supported. Be sure to await previous act() calls before making a new one. ");
            }
            actScopeDepth = prevActScopeDepth;
          }
        }
        function recursivelyFlushAsyncActWork(returnValue, resolve, reject) {
          {
            var queue = ReactCurrentActQueue.current;
            if (queue !== null) {
              try {
                flushActQueue(queue);
                enqueueTask(function() {
                  if (queue.length === 0) {
                    ReactCurrentActQueue.current = null;
                    resolve(returnValue);
                  } else {
                    recursivelyFlushAsyncActWork(returnValue, resolve, reject);
                  }
                });
              } catch (error2) {
                reject(error2);
              }
            } else {
              resolve(returnValue);
            }
          }
        }
        var isFlushing = false;
        function flushActQueue(queue) {
          {
            if (!isFlushing) {
              isFlushing = true;
              var i = 0;
              try {
                for (; i < queue.length; i++) {
                  var callback = queue[i];
                  do {
                    callback = callback(true);
                  } while (callback !== null);
                }
                queue.length = 0;
              } catch (error2) {
                queue = queue.slice(i + 1);
                throw error2;
              } finally {
                isFlushing = false;
              }
            }
          }
        }
        var createElement$1 = createElementWithValidation;
        var cloneElement$1 = cloneElementWithValidation;
        var createFactory = createFactoryWithValidation;
        var Children = {
          map: mapChildren,
          forEach: forEachChildren,
          count: countChildren,
          toArray,
          only: onlyChild
        };
        exports2.Children = Children;
        exports2.Component = Component;
        exports2.Fragment = REACT_FRAGMENT_TYPE;
        exports2.Profiler = REACT_PROFILER_TYPE;
        exports2.PureComponent = PureComponent;
        exports2.StrictMode = REACT_STRICT_MODE_TYPE;
        exports2.Suspense = REACT_SUSPENSE_TYPE;
        exports2.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = ReactSharedInternals;
        exports2.act = act;
        exports2.cloneElement = cloneElement$1;
        exports2.createContext = createContext;
        exports2.createElement = createElement$1;
        exports2.createFactory = createFactory;
        exports2.createRef = createRef;
        exports2.forwardRef = forwardRef;
        exports2.isValidElement = isValidElement;
        exports2.lazy = lazy;
        exports2.memo = memo;
        exports2.startTransition = startTransition;
        exports2.unstable_act = act;
        exports2.useCallback = useCallback;
        exports2.useContext = useContext;
        exports2.useDebugValue = useDebugValue;
        exports2.useDeferredValue = useDeferredValue;
        exports2.useEffect = useEffect;
        exports2.useId = useId;
        exports2.useImperativeHandle = useImperativeHandle;
        exports2.useInsertionEffect = useInsertionEffect;
        exports2.useLayoutEffect = useLayoutEffect;
        exports2.useMemo = useMemo;
        exports2.useReducer = useReducer;
        exports2.useRef = useRef;
        exports2.useState = useState;
        exports2.useSyncExternalStore = useSyncExternalStore;
        exports2.useTransition = useTransition;
        exports2.version = ReactVersion;
        if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop === "function") {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(new Error());
        }
      })();
    }
  }
});

// node_modules/react/index.js
var require_react = __commonJS({
  "node_modules/react/index.js"(exports2, module2) {
    "use strict";
    if (process.env.NODE_ENV === "production") {
      module2.exports = require_react_production_min();
    } else {
      module2.exports = require_react_development();
    }
  }
});

// node_modules/react/cjs/react-jsx-runtime.production.min.js
var require_react_jsx_runtime_production_min = __commonJS({
  "node_modules/react/cjs/react-jsx-runtime.production.min.js"(exports2) {
    "use strict";
    var f = require_react();
    var k = /* @__PURE__ */ Symbol.for("react.element");
    var l = /* @__PURE__ */ Symbol.for("react.fragment");
    var m = Object.prototype.hasOwnProperty;
    var n = f.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner;
    var p = { key: true, ref: true, __self: true, __source: true };
    function q(c, a, g) {
      var b, d = {}, e = null, h = null;
      void 0 !== g && (e = "" + g);
      void 0 !== a.key && (e = "" + a.key);
      void 0 !== a.ref && (h = a.ref);
      for (b in a) m.call(a, b) && !p.hasOwnProperty(b) && (d[b] = a[b]);
      if (c && c.defaultProps) for (b in a = c.defaultProps, a) void 0 === d[b] && (d[b] = a[b]);
      return { $$typeof: k, type: c, key: e, ref: h, props: d, _owner: n.current };
    }
    exports2.Fragment = l;
    exports2.jsx = q;
    exports2.jsxs = q;
  }
});

// node_modules/react/cjs/react-jsx-runtime.development.js
var require_react_jsx_runtime_development = __commonJS({
  "node_modules/react/cjs/react-jsx-runtime.development.js"(exports2) {
    "use strict";
    if (process.env.NODE_ENV !== "production") {
      (function() {
        "use strict";
        var React = require_react();
        var REACT_ELEMENT_TYPE = /* @__PURE__ */ Symbol.for("react.element");
        var REACT_PORTAL_TYPE = /* @__PURE__ */ Symbol.for("react.portal");
        var REACT_FRAGMENT_TYPE = /* @__PURE__ */ Symbol.for("react.fragment");
        var REACT_STRICT_MODE_TYPE = /* @__PURE__ */ Symbol.for("react.strict_mode");
        var REACT_PROFILER_TYPE = /* @__PURE__ */ Symbol.for("react.profiler");
        var REACT_PROVIDER_TYPE = /* @__PURE__ */ Symbol.for("react.provider");
        var REACT_CONTEXT_TYPE = /* @__PURE__ */ Symbol.for("react.context");
        var REACT_FORWARD_REF_TYPE = /* @__PURE__ */ Symbol.for("react.forward_ref");
        var REACT_SUSPENSE_TYPE = /* @__PURE__ */ Symbol.for("react.suspense");
        var REACT_SUSPENSE_LIST_TYPE = /* @__PURE__ */ Symbol.for("react.suspense_list");
        var REACT_MEMO_TYPE = /* @__PURE__ */ Symbol.for("react.memo");
        var REACT_LAZY_TYPE = /* @__PURE__ */ Symbol.for("react.lazy");
        var REACT_OFFSCREEN_TYPE = /* @__PURE__ */ Symbol.for("react.offscreen");
        var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
        var FAUX_ITERATOR_SYMBOL = "@@iterator";
        function getIteratorFn(maybeIterable) {
          if (maybeIterable === null || typeof maybeIterable !== "object") {
            return null;
          }
          var maybeIterator = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable[FAUX_ITERATOR_SYMBOL];
          if (typeof maybeIterator === "function") {
            return maybeIterator;
          }
          return null;
        }
        var ReactSharedInternals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
        function error(format) {
          {
            {
              for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
                args[_key2 - 1] = arguments[_key2];
              }
              printWarning("error", format, args);
            }
          }
        }
        function printWarning(level, format, args) {
          {
            var ReactDebugCurrentFrame2 = ReactSharedInternals.ReactDebugCurrentFrame;
            var stack = ReactDebugCurrentFrame2.getStackAddendum();
            if (stack !== "") {
              format += "%s";
              args = args.concat([stack]);
            }
            var argsWithFormat = args.map(function(item) {
              return String(item);
            });
            argsWithFormat.unshift("Warning: " + format);
            Function.prototype.apply.call(console[level], console, argsWithFormat);
          }
        }
        var enableScopeAPI = false;
        var enableCacheElement = false;
        var enableTransitionTracing = false;
        var enableLegacyHidden = false;
        var enableDebugTracing = false;
        var REACT_MODULE_REFERENCE;
        {
          REACT_MODULE_REFERENCE = /* @__PURE__ */ Symbol.for("react.module.reference");
        }
        function isValidElementType(type) {
          if (typeof type === "string" || typeof type === "function") {
            return true;
          }
          if (type === REACT_FRAGMENT_TYPE || type === REACT_PROFILER_TYPE || enableDebugTracing || type === REACT_STRICT_MODE_TYPE || type === REACT_SUSPENSE_TYPE || type === REACT_SUSPENSE_LIST_TYPE || enableLegacyHidden || type === REACT_OFFSCREEN_TYPE || enableScopeAPI || enableCacheElement || enableTransitionTracing) {
            return true;
          }
          if (typeof type === "object" && type !== null) {
            if (type.$$typeof === REACT_LAZY_TYPE || type.$$typeof === REACT_MEMO_TYPE || type.$$typeof === REACT_PROVIDER_TYPE || type.$$typeof === REACT_CONTEXT_TYPE || type.$$typeof === REACT_FORWARD_REF_TYPE || // This needs to include all possible module reference object
            // types supported by any Flight configuration anywhere since
            // we don't know which Flight build this will end up being used
            // with.
            type.$$typeof === REACT_MODULE_REFERENCE || type.getModuleId !== void 0) {
              return true;
            }
          }
          return false;
        }
        function getWrappedName(outerType, innerType, wrapperName) {
          var displayName = outerType.displayName;
          if (displayName) {
            return displayName;
          }
          var functionName = innerType.displayName || innerType.name || "";
          return functionName !== "" ? wrapperName + "(" + functionName + ")" : wrapperName;
        }
        function getContextName(type) {
          return type.displayName || "Context";
        }
        function getComponentNameFromType(type) {
          if (type == null) {
            return null;
          }
          {
            if (typeof type.tag === "number") {
              error("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue.");
            }
          }
          if (typeof type === "function") {
            return type.displayName || type.name || null;
          }
          if (typeof type === "string") {
            return type;
          }
          switch (type) {
            case REACT_FRAGMENT_TYPE:
              return "Fragment";
            case REACT_PORTAL_TYPE:
              return "Portal";
            case REACT_PROFILER_TYPE:
              return "Profiler";
            case REACT_STRICT_MODE_TYPE:
              return "StrictMode";
            case REACT_SUSPENSE_TYPE:
              return "Suspense";
            case REACT_SUSPENSE_LIST_TYPE:
              return "SuspenseList";
          }
          if (typeof type === "object") {
            switch (type.$$typeof) {
              case REACT_CONTEXT_TYPE:
                var context = type;
                return getContextName(context) + ".Consumer";
              case REACT_PROVIDER_TYPE:
                var provider = type;
                return getContextName(provider._context) + ".Provider";
              case REACT_FORWARD_REF_TYPE:
                return getWrappedName(type, type.render, "ForwardRef");
              case REACT_MEMO_TYPE:
                var outerName = type.displayName || null;
                if (outerName !== null) {
                  return outerName;
                }
                return getComponentNameFromType(type.type) || "Memo";
              case REACT_LAZY_TYPE: {
                var lazyComponent = type;
                var payload = lazyComponent._payload;
                var init = lazyComponent._init;
                try {
                  return getComponentNameFromType(init(payload));
                } catch (x) {
                  return null;
                }
              }
            }
          }
          return null;
        }
        var assign = Object.assign;
        var disabledDepth = 0;
        var prevLog;
        var prevInfo;
        var prevWarn;
        var prevError;
        var prevGroup;
        var prevGroupCollapsed;
        var prevGroupEnd;
        function disabledLog() {
        }
        disabledLog.__reactDisabledLog = true;
        function disableLogs() {
          {
            if (disabledDepth === 0) {
              prevLog = console.log;
              prevInfo = console.info;
              prevWarn = console.warn;
              prevError = console.error;
              prevGroup = console.group;
              prevGroupCollapsed = console.groupCollapsed;
              prevGroupEnd = console.groupEnd;
              var props = {
                configurable: true,
                enumerable: true,
                value: disabledLog,
                writable: true
              };
              Object.defineProperties(console, {
                info: props,
                log: props,
                warn: props,
                error: props,
                group: props,
                groupCollapsed: props,
                groupEnd: props
              });
            }
            disabledDepth++;
          }
        }
        function reenableLogs() {
          {
            disabledDepth--;
            if (disabledDepth === 0) {
              var props = {
                configurable: true,
                enumerable: true,
                writable: true
              };
              Object.defineProperties(console, {
                log: assign({}, props, {
                  value: prevLog
                }),
                info: assign({}, props, {
                  value: prevInfo
                }),
                warn: assign({}, props, {
                  value: prevWarn
                }),
                error: assign({}, props, {
                  value: prevError
                }),
                group: assign({}, props, {
                  value: prevGroup
                }),
                groupCollapsed: assign({}, props, {
                  value: prevGroupCollapsed
                }),
                groupEnd: assign({}, props, {
                  value: prevGroupEnd
                })
              });
            }
            if (disabledDepth < 0) {
              error("disabledDepth fell below zero. This is a bug in React. Please file an issue.");
            }
          }
        }
        var ReactCurrentDispatcher = ReactSharedInternals.ReactCurrentDispatcher;
        var prefix;
        function describeBuiltInComponentFrame(name, source, ownerFn) {
          {
            if (prefix === void 0) {
              try {
                throw Error();
              } catch (x) {
                var match = x.stack.trim().match(/\n( *(at )?)/);
                prefix = match && match[1] || "";
              }
            }
            return "\n" + prefix + name;
          }
        }
        var reentry = false;
        var componentFrameCache;
        {
          var PossiblyWeakMap = typeof WeakMap === "function" ? WeakMap : Map;
          componentFrameCache = new PossiblyWeakMap();
        }
        function describeNativeComponentFrame(fn, construct) {
          if (!fn || reentry) {
            return "";
          }
          {
            var frame = componentFrameCache.get(fn);
            if (frame !== void 0) {
              return frame;
            }
          }
          var control;
          reentry = true;
          var previousPrepareStackTrace = Error.prepareStackTrace;
          Error.prepareStackTrace = void 0;
          var previousDispatcher;
          {
            previousDispatcher = ReactCurrentDispatcher.current;
            ReactCurrentDispatcher.current = null;
            disableLogs();
          }
          try {
            if (construct) {
              var Fake = function() {
                throw Error();
              };
              Object.defineProperty(Fake.prototype, "props", {
                set: function() {
                  throw Error();
                }
              });
              if (typeof Reflect === "object" && Reflect.construct) {
                try {
                  Reflect.construct(Fake, []);
                } catch (x) {
                  control = x;
                }
                Reflect.construct(fn, [], Fake);
              } else {
                try {
                  Fake.call();
                } catch (x) {
                  control = x;
                }
                fn.call(Fake.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (x) {
                control = x;
              }
              fn();
            }
          } catch (sample) {
            if (sample && control && typeof sample.stack === "string") {
              var sampleLines = sample.stack.split("\n");
              var controlLines = control.stack.split("\n");
              var s = sampleLines.length - 1;
              var c = controlLines.length - 1;
              while (s >= 1 && c >= 0 && sampleLines[s] !== controlLines[c]) {
                c--;
              }
              for (; s >= 1 && c >= 0; s--, c--) {
                if (sampleLines[s] !== controlLines[c]) {
                  if (s !== 1 || c !== 1) {
                    do {
                      s--;
                      c--;
                      if (c < 0 || sampleLines[s] !== controlLines[c]) {
                        var _frame = "\n" + sampleLines[s].replace(" at new ", " at ");
                        if (fn.displayName && _frame.includes("<anonymous>")) {
                          _frame = _frame.replace("<anonymous>", fn.displayName);
                        }
                        {
                          if (typeof fn === "function") {
                            componentFrameCache.set(fn, _frame);
                          }
                        }
                        return _frame;
                      }
                    } while (s >= 1 && c >= 0);
                  }
                  break;
                }
              }
            }
          } finally {
            reentry = false;
            {
              ReactCurrentDispatcher.current = previousDispatcher;
              reenableLogs();
            }
            Error.prepareStackTrace = previousPrepareStackTrace;
          }
          var name = fn ? fn.displayName || fn.name : "";
          var syntheticFrame = name ? describeBuiltInComponentFrame(name) : "";
          {
            if (typeof fn === "function") {
              componentFrameCache.set(fn, syntheticFrame);
            }
          }
          return syntheticFrame;
        }
        function describeFunctionComponentFrame(fn, source, ownerFn) {
          {
            return describeNativeComponentFrame(fn, false);
          }
        }
        function shouldConstruct(Component) {
          var prototype = Component.prototype;
          return !!(prototype && prototype.isReactComponent);
        }
        function describeUnknownElementTypeFrameInDEV(type, source, ownerFn) {
          if (type == null) {
            return "";
          }
          if (typeof type === "function") {
            {
              return describeNativeComponentFrame(type, shouldConstruct(type));
            }
          }
          if (typeof type === "string") {
            return describeBuiltInComponentFrame(type);
          }
          switch (type) {
            case REACT_SUSPENSE_TYPE:
              return describeBuiltInComponentFrame("Suspense");
            case REACT_SUSPENSE_LIST_TYPE:
              return describeBuiltInComponentFrame("SuspenseList");
          }
          if (typeof type === "object") {
            switch (type.$$typeof) {
              case REACT_FORWARD_REF_TYPE:
                return describeFunctionComponentFrame(type.render);
              case REACT_MEMO_TYPE:
                return describeUnknownElementTypeFrameInDEV(type.type, source, ownerFn);
              case REACT_LAZY_TYPE: {
                var lazyComponent = type;
                var payload = lazyComponent._payload;
                var init = lazyComponent._init;
                try {
                  return describeUnknownElementTypeFrameInDEV(init(payload), source, ownerFn);
                } catch (x) {
                }
              }
            }
          }
          return "";
        }
        var hasOwnProperty = Object.prototype.hasOwnProperty;
        var loggedTypeFailures = {};
        var ReactDebugCurrentFrame = ReactSharedInternals.ReactDebugCurrentFrame;
        function setCurrentlyValidatingElement(element) {
          {
            if (element) {
              var owner = element._owner;
              var stack = describeUnknownElementTypeFrameInDEV(element.type, element._source, owner ? owner.type : null);
              ReactDebugCurrentFrame.setExtraStackFrame(stack);
            } else {
              ReactDebugCurrentFrame.setExtraStackFrame(null);
            }
          }
        }
        function checkPropTypes(typeSpecs, values, location, componentName, element) {
          {
            var has = Function.call.bind(hasOwnProperty);
            for (var typeSpecName in typeSpecs) {
              if (has(typeSpecs, typeSpecName)) {
                var error$1 = void 0;
                try {
                  if (typeof typeSpecs[typeSpecName] !== "function") {
                    var err = Error((componentName || "React class") + ": " + location + " type `" + typeSpecName + "` is invalid; it must be a function, usually from the `prop-types` package, but received `" + typeof typeSpecs[typeSpecName] + "`.This often happens because of typos such as `PropTypes.function` instead of `PropTypes.func`.");
                    err.name = "Invariant Violation";
                    throw err;
                  }
                  error$1 = typeSpecs[typeSpecName](values, typeSpecName, componentName, location, null, "SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED");
                } catch (ex) {
                  error$1 = ex;
                }
                if (error$1 && !(error$1 instanceof Error)) {
                  setCurrentlyValidatingElement(element);
                  error("%s: type specification of %s `%s` is invalid; the type checker function must return `null` or an `Error` but returned a %s. You may have forgotten to pass an argument to the type checker creator (arrayOf, instanceOf, objectOf, oneOf, oneOfType, and shape all require an argument).", componentName || "React class", location, typeSpecName, typeof error$1);
                  setCurrentlyValidatingElement(null);
                }
                if (error$1 instanceof Error && !(error$1.message in loggedTypeFailures)) {
                  loggedTypeFailures[error$1.message] = true;
                  setCurrentlyValidatingElement(element);
                  error("Failed %s type: %s", location, error$1.message);
                  setCurrentlyValidatingElement(null);
                }
              }
            }
          }
        }
        var isArrayImpl = Array.isArray;
        function isArray(a) {
          return isArrayImpl(a);
        }
        function typeName(value) {
          {
            var hasToStringTag = typeof Symbol === "function" && Symbol.toStringTag;
            var type = hasToStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
            return type;
          }
        }
        function willCoercionThrow(value) {
          {
            try {
              testStringCoercion(value);
              return false;
            } catch (e) {
              return true;
            }
          }
        }
        function testStringCoercion(value) {
          return "" + value;
        }
        function checkKeyStringCoercion(value) {
          {
            if (willCoercionThrow(value)) {
              error("The provided key is an unsupported type %s. This value must be coerced to a string before before using it here.", typeName(value));
              return testStringCoercion(value);
            }
          }
        }
        var ReactCurrentOwner = ReactSharedInternals.ReactCurrentOwner;
        var RESERVED_PROPS = {
          key: true,
          ref: true,
          __self: true,
          __source: true
        };
        var specialPropKeyWarningShown;
        var specialPropRefWarningShown;
        var didWarnAboutStringRefs;
        {
          didWarnAboutStringRefs = {};
        }
        function hasValidRef(config) {
          {
            if (hasOwnProperty.call(config, "ref")) {
              var getter = Object.getOwnPropertyDescriptor(config, "ref").get;
              if (getter && getter.isReactWarning) {
                return false;
              }
            }
          }
          return config.ref !== void 0;
        }
        function hasValidKey(config) {
          {
            if (hasOwnProperty.call(config, "key")) {
              var getter = Object.getOwnPropertyDescriptor(config, "key").get;
              if (getter && getter.isReactWarning) {
                return false;
              }
            }
          }
          return config.key !== void 0;
        }
        function warnIfStringRefCannotBeAutoConverted(config, self) {
          {
            if (typeof config.ref === "string" && ReactCurrentOwner.current && self && ReactCurrentOwner.current.stateNode !== self) {
              var componentName = getComponentNameFromType(ReactCurrentOwner.current.type);
              if (!didWarnAboutStringRefs[componentName]) {
                error('Component "%s" contains the string ref "%s". Support for string refs will be removed in a future major release. This case cannot be automatically converted to an arrow function. We ask you to manually fix this case by using useRef() or createRef() instead. Learn more about using refs safely here: https://reactjs.org/link/strict-mode-string-ref', getComponentNameFromType(ReactCurrentOwner.current.type), config.ref);
                didWarnAboutStringRefs[componentName] = true;
              }
            }
          }
        }
        function defineKeyPropWarningGetter(props, displayName) {
          {
            var warnAboutAccessingKey = function() {
              if (!specialPropKeyWarningShown) {
                specialPropKeyWarningShown = true;
                error("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", displayName);
              }
            };
            warnAboutAccessingKey.isReactWarning = true;
            Object.defineProperty(props, "key", {
              get: warnAboutAccessingKey,
              configurable: true
            });
          }
        }
        function defineRefPropWarningGetter(props, displayName) {
          {
            var warnAboutAccessingRef = function() {
              if (!specialPropRefWarningShown) {
                specialPropRefWarningShown = true;
                error("%s: `ref` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", displayName);
              }
            };
            warnAboutAccessingRef.isReactWarning = true;
            Object.defineProperty(props, "ref", {
              get: warnAboutAccessingRef,
              configurable: true
            });
          }
        }
        var ReactElement = function(type, key, ref, self, source, owner, props) {
          var element = {
            // This tag allows us to uniquely identify this as a React Element
            $$typeof: REACT_ELEMENT_TYPE,
            // Built-in properties that belong on the element
            type,
            key,
            ref,
            props,
            // Record the component responsible for creating this element.
            _owner: owner
          };
          {
            element._store = {};
            Object.defineProperty(element._store, "validated", {
              configurable: false,
              enumerable: false,
              writable: true,
              value: false
            });
            Object.defineProperty(element, "_self", {
              configurable: false,
              enumerable: false,
              writable: false,
              value: self
            });
            Object.defineProperty(element, "_source", {
              configurable: false,
              enumerable: false,
              writable: false,
              value: source
            });
            if (Object.freeze) {
              Object.freeze(element.props);
              Object.freeze(element);
            }
          }
          return element;
        };
        function jsxDEV(type, config, maybeKey, source, self) {
          {
            var propName;
            var props = {};
            var key = null;
            var ref = null;
            if (maybeKey !== void 0) {
              {
                checkKeyStringCoercion(maybeKey);
              }
              key = "" + maybeKey;
            }
            if (hasValidKey(config)) {
              {
                checkKeyStringCoercion(config.key);
              }
              key = "" + config.key;
            }
            if (hasValidRef(config)) {
              ref = config.ref;
              warnIfStringRefCannotBeAutoConverted(config, self);
            }
            for (propName in config) {
              if (hasOwnProperty.call(config, propName) && !RESERVED_PROPS.hasOwnProperty(propName)) {
                props[propName] = config[propName];
              }
            }
            if (type && type.defaultProps) {
              var defaultProps = type.defaultProps;
              for (propName in defaultProps) {
                if (props[propName] === void 0) {
                  props[propName] = defaultProps[propName];
                }
              }
            }
            if (key || ref) {
              var displayName = typeof type === "function" ? type.displayName || type.name || "Unknown" : type;
              if (key) {
                defineKeyPropWarningGetter(props, displayName);
              }
              if (ref) {
                defineRefPropWarningGetter(props, displayName);
              }
            }
            return ReactElement(type, key, ref, self, source, ReactCurrentOwner.current, props);
          }
        }
        var ReactCurrentOwner$1 = ReactSharedInternals.ReactCurrentOwner;
        var ReactDebugCurrentFrame$1 = ReactSharedInternals.ReactDebugCurrentFrame;
        function setCurrentlyValidatingElement$1(element) {
          {
            if (element) {
              var owner = element._owner;
              var stack = describeUnknownElementTypeFrameInDEV(element.type, element._source, owner ? owner.type : null);
              ReactDebugCurrentFrame$1.setExtraStackFrame(stack);
            } else {
              ReactDebugCurrentFrame$1.setExtraStackFrame(null);
            }
          }
        }
        var propTypesMisspellWarningShown;
        {
          propTypesMisspellWarningShown = false;
        }
        function isValidElement(object) {
          {
            return typeof object === "object" && object !== null && object.$$typeof === REACT_ELEMENT_TYPE;
          }
        }
        function getDeclarationErrorAddendum() {
          {
            if (ReactCurrentOwner$1.current) {
              var name = getComponentNameFromType(ReactCurrentOwner$1.current.type);
              if (name) {
                return "\n\nCheck the render method of `" + name + "`.";
              }
            }
            return "";
          }
        }
        function getSourceInfoErrorAddendum(source) {
          {
            if (source !== void 0) {
              var fileName = source.fileName.replace(/^.*[\\\/]/, "");
              var lineNumber = source.lineNumber;
              return "\n\nCheck your code at " + fileName + ":" + lineNumber + ".";
            }
            return "";
          }
        }
        var ownerHasKeyUseWarning = {};
        function getCurrentComponentErrorInfo(parentType) {
          {
            var info = getDeclarationErrorAddendum();
            if (!info) {
              var parentName = typeof parentType === "string" ? parentType : parentType.displayName || parentType.name;
              if (parentName) {
                info = "\n\nCheck the top-level render call using <" + parentName + ">.";
              }
            }
            return info;
          }
        }
        function validateExplicitKey(element, parentType) {
          {
            if (!element._store || element._store.validated || element.key != null) {
              return;
            }
            element._store.validated = true;
            var currentComponentErrorInfo = getCurrentComponentErrorInfo(parentType);
            if (ownerHasKeyUseWarning[currentComponentErrorInfo]) {
              return;
            }
            ownerHasKeyUseWarning[currentComponentErrorInfo] = true;
            var childOwner = "";
            if (element && element._owner && element._owner !== ReactCurrentOwner$1.current) {
              childOwner = " It was passed a child from " + getComponentNameFromType(element._owner.type) + ".";
            }
            setCurrentlyValidatingElement$1(element);
            error('Each child in a list should have a unique "key" prop.%s%s See https://reactjs.org/link/warning-keys for more information.', currentComponentErrorInfo, childOwner);
            setCurrentlyValidatingElement$1(null);
          }
        }
        function validateChildKeys(node, parentType) {
          {
            if (typeof node !== "object") {
              return;
            }
            if (isArray(node)) {
              for (var i = 0; i < node.length; i++) {
                var child = node[i];
                if (isValidElement(child)) {
                  validateExplicitKey(child, parentType);
                }
              }
            } else if (isValidElement(node)) {
              if (node._store) {
                node._store.validated = true;
              }
            } else if (node) {
              var iteratorFn = getIteratorFn(node);
              if (typeof iteratorFn === "function") {
                if (iteratorFn !== node.entries) {
                  var iterator = iteratorFn.call(node);
                  var step;
                  while (!(step = iterator.next()).done) {
                    if (isValidElement(step.value)) {
                      validateExplicitKey(step.value, parentType);
                    }
                  }
                }
              }
            }
          }
        }
        function validatePropTypes(element) {
          {
            var type = element.type;
            if (type === null || type === void 0 || typeof type === "string") {
              return;
            }
            var propTypes;
            if (typeof type === "function") {
              propTypes = type.propTypes;
            } else if (typeof type === "object" && (type.$$typeof === REACT_FORWARD_REF_TYPE || // Note: Memo only checks outer props here.
            // Inner props are checked in the reconciler.
            type.$$typeof === REACT_MEMO_TYPE)) {
              propTypes = type.propTypes;
            } else {
              return;
            }
            if (propTypes) {
              var name = getComponentNameFromType(type);
              checkPropTypes(propTypes, element.props, "prop", name, element);
            } else if (type.PropTypes !== void 0 && !propTypesMisspellWarningShown) {
              propTypesMisspellWarningShown = true;
              var _name = getComponentNameFromType(type);
              error("Component %s declared `PropTypes` instead of `propTypes`. Did you misspell the property assignment?", _name || "Unknown");
            }
            if (typeof type.getDefaultProps === "function" && !type.getDefaultProps.isReactClassApproved) {
              error("getDefaultProps is only used on classic React.createClass definitions. Use a static property named `defaultProps` instead.");
            }
          }
        }
        function validateFragmentProps(fragment) {
          {
            var keys = Object.keys(fragment.props);
            for (var i = 0; i < keys.length; i++) {
              var key = keys[i];
              if (key !== "children" && key !== "key") {
                setCurrentlyValidatingElement$1(fragment);
                error("Invalid prop `%s` supplied to `React.Fragment`. React.Fragment can only have `key` and `children` props.", key);
                setCurrentlyValidatingElement$1(null);
                break;
              }
            }
            if (fragment.ref !== null) {
              setCurrentlyValidatingElement$1(fragment);
              error("Invalid attribute `ref` supplied to `React.Fragment`.");
              setCurrentlyValidatingElement$1(null);
            }
          }
        }
        var didWarnAboutKeySpread = {};
        function jsxWithValidation(type, props, key, isStaticChildren, source, self) {
          {
            var validType = isValidElementType(type);
            if (!validType) {
              var info = "";
              if (type === void 0 || typeof type === "object" && type !== null && Object.keys(type).length === 0) {
                info += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.";
              }
              var sourceInfo = getSourceInfoErrorAddendum(source);
              if (sourceInfo) {
                info += sourceInfo;
              } else {
                info += getDeclarationErrorAddendum();
              }
              var typeString;
              if (type === null) {
                typeString = "null";
              } else if (isArray(type)) {
                typeString = "array";
              } else if (type !== void 0 && type.$$typeof === REACT_ELEMENT_TYPE) {
                typeString = "<" + (getComponentNameFromType(type.type) || "Unknown") + " />";
                info = " Did you accidentally export a JSX literal instead of a component?";
              } else {
                typeString = typeof type;
              }
              error("React.jsx: type is invalid -- expected a string (for built-in components) or a class/function (for composite components) but got: %s.%s", typeString, info);
            }
            var element = jsxDEV(type, props, key, source, self);
            if (element == null) {
              return element;
            }
            if (validType) {
              var children = props.children;
              if (children !== void 0) {
                if (isStaticChildren) {
                  if (isArray(children)) {
                    for (var i = 0; i < children.length; i++) {
                      validateChildKeys(children[i], type);
                    }
                    if (Object.freeze) {
                      Object.freeze(children);
                    }
                  } else {
                    error("React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead.");
                  }
                } else {
                  validateChildKeys(children, type);
                }
              }
            }
            {
              if (hasOwnProperty.call(props, "key")) {
                var componentName = getComponentNameFromType(type);
                var keys = Object.keys(props).filter(function(k) {
                  return k !== "key";
                });
                var beforeExample = keys.length > 0 ? "{key: someKey, " + keys.join(": ..., ") + ": ...}" : "{key: someKey}";
                if (!didWarnAboutKeySpread[componentName + beforeExample]) {
                  var afterExample = keys.length > 0 ? "{" + keys.join(": ..., ") + ": ...}" : "{}";
                  error('A props object containing a "key" prop is being spread into JSX:\n  let props = %s;\n  <%s {...props} />\nReact keys must be passed directly to JSX without using spread:\n  let props = %s;\n  <%s key={someKey} {...props} />', beforeExample, componentName, afterExample, componentName);
                  didWarnAboutKeySpread[componentName + beforeExample] = true;
                }
              }
            }
            if (type === REACT_FRAGMENT_TYPE) {
              validateFragmentProps(element);
            } else {
              validatePropTypes(element);
            }
            return element;
          }
        }
        function jsxWithValidationStatic(type, props, key) {
          {
            return jsxWithValidation(type, props, key, true);
          }
        }
        function jsxWithValidationDynamic(type, props, key) {
          {
            return jsxWithValidation(type, props, key, false);
          }
        }
        var jsx3 = jsxWithValidationDynamic;
        var jsxs3 = jsxWithValidationStatic;
        exports2.Fragment = REACT_FRAGMENT_TYPE;
        exports2.jsx = jsx3;
        exports2.jsxs = jsxs3;
      })();
    }
  }
});

// node_modules/react/jsx-runtime.js
var require_jsx_runtime = __commonJS({
  "node_modules/react/jsx-runtime.js"(exports2, module2) {
    "use strict";
    if (process.env.NODE_ENV === "production") {
      module2.exports = require_react_jsx_runtime_production_min();
    } else {
      module2.exports = require_react_jsx_runtime_development();
    }
  }
});

// .test-pdf.tsx
var import_renderer3 = require("@react-pdf/renderer");
var import_fs = __toESM(require("fs"));

// lib/plan-pdf.tsx
var import_renderer = require("@react-pdf/renderer");

// lib/nse.ts
var NIVELES_NSE = [
  { clave: "ab", etiqueta: "AB", desde: 75, color: "#9966f2" },
  { clave: "c_mas", etiqueta: "C+", desde: 65, color: "#7d6cf0" },
  { clave: "c", etiqueta: "C", desde: 55, color: "#5b7ce8" },
  { clave: "c_menos", etiqueta: "C-", desde: 45, color: "#3f97d8" },
  { clave: "d_mas", etiqueta: "D+", desde: 35, color: "#27b5e2" },
  { clave: "de", etiqueta: "DE", desde: 0, color: "#57707d" }
];

// lib/edades.ts
var W_25A34 = 0.336;
var W_35A44 = 0.3;
var W_45A54 = 0.26;
var W_55A59 = 0.104;
var W_60A64_DE_60MAS = 0.327;
var COLORES = [
  "#34d399",
  "#2cbb8b",
  "#25a37f",
  "#1e8a71",
  "#177262",
  "#115a51"
];
var r1 = (x) => Math.round(x * 10) / 10;
function rangosEdadEstandar(edades) {
  if (!edades) return null;
  const p6064 = edades.pct60a64 ?? edades.pct60ymas * W_60A64_DE_60MAS;
  const p65 = edades.pct65ymas ?? edades.pct60ymas * (1 - W_60A64_DE_60MAS);
  const valores = [
    edades.pct18a24,
    edades.pct25a59 * W_25A34,
    edades.pct25a59 * W_35A44,
    edades.pct25a59 * W_45A54,
    edades.pct25a59 * W_55A59 + p6064,
    p65
  ];
  const suma = valores.reduce((s, v) => s + v, 0);
  if (suma < 99.5 || suma > 100.5) {
    console.warn(
      `[edades] Los rangos suman ${suma.toFixed(1)}% del universo 18+ (deben sumar 100 \xB10.5)`,
      { entrada: edades, rangos: valores.map(r1) }
    );
  }
  const etiquetas = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
  return etiquetas.map((etiqueta, i) => ({
    etiqueta,
    pct: r1(valores[i]),
    color: COLORES[i]
  }));
}

// lib/geo.ts
var COS_MX = Math.cos(23 * Math.PI / 180);

// lib/tacticas.ts
var TACTICAS = {
  poi: { nombre: "Geo-Fence POI", descriptor: "Qui\xE9n visita lugares clave" },
  conquista: { nombre: "Geo-Fence Conquista", descriptor: "Qui\xE9n visita a tu competencia" },
  proximidad: { nombre: "Geo-Fence Proximidad", descriptor: "Qui\xE9n est\xE1 cerca ahora" },
  trade: { nombre: "Geo-Trade Area", descriptor: "D\xF3nde est\xE1n tus pr\xF3ximos clientes" },
  targeting: { nombre: "Geo-Targeting", descriptor: "Qui\xE9n vive y busca en el territorio" },
  pdooh: { nombre: "Geo-PDOOH", descriptor: "El exterior, ahora medible" },
  audiencias: { nombre: "Geo-Audiencias", descriptor: "Marcas sin punto de venta" }
};
var CLAVES_TACTICAS = [
  "poi",
  "conquista",
  "proximidad",
  "trade",
  "targeting",
  "pdooh",
  "audiencias"
];

// lib/plan-pdf.tsx
var import_jsx_runtime = (
  // eslint-disable-next-line jsx-a11y/alt-text
  __toESM(require_jsx_runtime())
);
var FONDO = "#f7f5ef";
var PANEL = "#ffffff";
var LINEA = "#e5e2d9";
var MAGENTA = "#f52d87";
var VIOLETA = "#9966f2";
var CIAN = "#27b5e2";
var BLANCO = "#111111";
var GRIS = "#4a4a4a";
var GRIS_OSCURO = "#8a8878";
var TINTA = "#333330";
var ANCHO_PAG = 816;
var MARGEN = 44;
var CONT = ANCHO_PAG - MARGEN * 2;
var fuentesRegistradas = false;
var BASE_ASSETS = "";
function registrarFuentes(base = "") {
  BASE_ASSETS = base;
  if (fuentesRegistradas) return;
  fuentesRegistradas = true;
  import_renderer.Font.register({
    family: "Montserrat",
    fonts: [
      { src: `${base}/fonts/Montserrat-Regular.ttf`, fontWeight: 400 },
      { src: `${base}/fonts/Montserrat-Medium.ttf`, fontWeight: 500 },
      { src: `${base}/fonts/Montserrat-SemiBold.ttf`, fontWeight: 600 },
      { src: `${base}/fonts/Montserrat-SemiBold.ttf`, fontWeight: 700 },
      { src: `${base}/fonts/Montserrat-SemiBold.ttf`, fontWeight: 800 }
    ]
  });
  import_renderer.Font.register({
    family: "DMMono",
    fonts: [
      { src: `${base}/fonts/DMMono-400.ttf`, fontWeight: 400 },
      { src: `${base}/fonts/DMMono-500.ttf`, fontWeight: 500 }
    ]
  });
  import_renderer.Font.registerHyphenationCallback((palabra) => [palabra]);
}
var fmt = (n) => n.toLocaleString("es-MX");
function textoPdf(s) {
  const limpio = s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "").replace(/[☀-➿⬀-⯿︀-️‍⃣-]/g, "").replace(/\s{2,}/g, " ").trim();
  return limpio || "\u2014";
}
function abreviarCiudad(s) {
  const limpio = textoPdf(s);
  const clave = limpio.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/(ciudad|cd\.?)\s+de\s+mexico\b/.test(clave) || clave === "cdmx") return "CDMX";
  const sinPrefijo = limpio.replace(/^(ciudad|cd\.?|villa|heroica)\s+(de\s+(los?\s+|las?\s+)?)?/i, "").trim();
  return sinPrefijo || limpio;
}
function Marca({ size = 40 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    import_renderer.Image,
    {
      src: `${BASE_ASSETS}/brand/gravity-simbolo.png`,
      style: { width: size, height: Math.round(size * 0.887) }
    }
  );
}
function Firma({ height = 24 }) {
  return (
    // eslint-disable-next-line jsx-a11y/alt-text
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_renderer.Image,
      {
        src: `${BASE_ASSETS}/brand/gravity-firma-negra.png`,
        style: { width: Math.round(height * (1200 / 239)), height }
      }
    )
  );
}
function Divisor({ width = CONT, height = 2.5 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.Svg, { width, height, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Defs, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.LinearGradient, { id: "grad", x1: "0", y1: "0", x2: "1", y2: "0", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Stop, { offset: "0", stopColor: MAGENTA }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Stop, { offset: "0.5", stopColor: VIOLETA }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Stop, { offset: "1", stopColor: CIAN })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Rect, { x: 0, y: 0, width, height, fill: "url(#grad)", rx: height / 2 })
  ] });
}
function Seccion({ etiqueta, titulo }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: { marginBottom: 14 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: { flexDirection: "row", alignItems: "center" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_renderer.Text,
        {
          style: {
            fontFamily: "DMMono",
            fontWeight: 500,
            fontSize: 9,
            letterSpacing: 2.6,
            color: MAGENTA
          },
          children: etiqueta.toUpperCase()
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.View, { style: { flexDirection: "row", marginLeft: 10 }, children: [MAGENTA, VIOLETA, CIAN].map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_renderer.View,
        {
          style: { width: 4, height: 4, borderRadius: 2, backgroundColor: c, marginRight: 4 }
        },
        c
      )) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { fontFamily: "Montserrat", fontWeight: 800, fontSize: 19, color: BLANCO, marginTop: 7 }, children: titulo })
  ] });
}
function FooterTresCol({ fecha }) {
  const col = { flex: 1 };
  const label = {
    fontFamily: "DMMono",
    fontWeight: 500,
    fontSize: 7,
    letterSpacing: 2,
    color: GRIS_OSCURO,
    marginBottom: 3
  };
  const valor = { fontFamily: "Montserrat", fontSize: 9, color: GRIS };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: { borderTopWidth: 0.8, borderTopColor: LINEA, paddingTop: 12, flexDirection: "row" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: col, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: label, children: "DATE" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: valor, children: fecha })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: col, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: label, children: "WEBSITE" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: valor, children: "www.linkstudio.mx" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: col, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: label, children: "E-MAIL" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: valor, children: "hello@linkstudio.mx" })
    ] })
  ] });
}
function Neon({ height: _height = 120 }) {
  return null;
}
function Cifra({ valor, descriptor }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: { flex: 1, paddingRight: 12 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { fontFamily: "Montserrat", fontWeight: 800, fontSize: 30, color: BLANCO }, children: valor }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_renderer.Text,
      {
        style: {
          fontFamily: "DMMono",
          fontWeight: 400,
          fontSize: 7.2,
          letterSpacing: 1.3,
          color: GRIS,
          marginTop: 3,
          lineHeight: 1.5
        },
        children: descriptor.toUpperCase()
      }
    )
  ] });
}
function BarraApilada({ titulo, segmentos, width }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: { width }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_renderer.Text,
      {
        style: {
          fontFamily: "DMMono",
          fontWeight: 500,
          fontSize: 7.5,
          letterSpacing: 1.8,
          color: GRIS,
          marginBottom: 5
        },
        children: titulo.toUpperCase()
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_renderer.View,
      {
        style: {
          flexDirection: "row",
          height: 9,
          borderRadius: 4.5,
          overflow: "hidden",
          backgroundColor: PANEL
        },
        children: segmentos.map(
          (s) => s.pct > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.View, { style: { width: `${s.pct}%`, backgroundColor: s.color } }, s.etiqueta)
        )
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.View, { style: { flexDirection: "row", flexWrap: "wrap", marginTop: 5 }, children: segmentos.map((s, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: { flexDirection: "row", marginRight: 8 }, children: [
      i > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { fontFamily: "DMMono", fontSize: 8, color: GRIS_OSCURO, marginRight: 8 }, children: "\xB7" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { fontFamily: "DMMono", fontSize: 8, color: s.color }, children: s.etiqueta }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.Text, { style: { fontFamily: "DMMono", fontSize: 8, color: TINTA, marginLeft: 3 }, children: [
        s.pct.toLocaleString("es-MX"),
        "%"
      ] })
    ] }, s.etiqueta)) })
  ] });
}
var ALTO_PILL = 72;
function PillTactica({
  clave,
  nombre,
  descriptor,
  destacada
}) {
  const W = (CONT - 16) / 2;
  const H = ALTO_PILL;
  const gradId = `pill-${clave}`;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: { width: W, height: H, marginBottom: 16 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.Svg, { width: W, height: H, style: { position: "absolute", top: 0, left: 0 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Defs, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.LinearGradient, { id: gradId, x1: "0", y1: "0", x2: "1", y2: "0", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Stop, { offset: "0", stopColor: MAGENTA }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Stop, { offset: "0.5", stopColor: VIOLETA }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Stop, { offset: "1", stopColor: CIAN })
      ] }) }),
      destacada ? (
        // react-pdf no pinta strokes con gradiente: el borde intenso
        // se simula con un rect de gradiente y el panel encima (2px)
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Rect, { x: 0, y: 0, width: W, height: H, rx: 13, fill: `url(#${gradId})` }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Rect, { x: 2, y: 2, width: W - 4, height: H - 4, rx: 11, fill: PANEL })
        ] })
      ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Rect, { x: 0.6, y: 0.6, width: W - 1.2, height: H - 1.2, rx: 12, fill: PANEL, stroke: LINEA, strokeWidth: 1 })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_renderer.View, { style: { paddingTop: destacada ? 10 : 16, paddingLeft: 18, paddingRight: 18 }, children: [
      destacada && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        import_renderer.Text,
        {
          style: { fontFamily: "DMMono", fontWeight: 500, fontSize: 6.5, letterSpacing: 1.4, color: MAGENTA, marginBottom: 4 },
          children: "RECOMENDADA PARA ESTE TERRITORIO"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { fontFamily: "Montserrat", fontWeight: 800, fontSize: 13, color: destacada ? BLANCO : TINTA }, children: nombre }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_renderer.Text, { style: { fontFamily: "Montserrat", fontSize: 9, color: GRIS, marginTop: 4 }, children: descriptor })
    ] })
  ] });
}
function ordenarTacticas(seleccion) {
  const sel = new Set(seleccion);
  return [
    ...CLAVES_TACTICAS.filter((c) => sel.has(c)),
    ...CLAVES_TACTICAS.filter((c) => !sel.has(c))
  ].map((clave) => ({ clave, ...TACTICAS[clave], destacada: sel.has(clave) }));
}
function segmentosNse(u) {
  const dist = u?.perfil?.nseDist;
  if (!dist) return null;
  return NIVELES_NSE.map((n) => ({ etiqueta: n.etiqueta, pct: dist[n.clave], color: n.color }));
}
function segmentosEdades(u) {
  const rangos = rangosEdadEstandar(u?.perfil?.edades);
  return rangos ? rangos.map((r) => ({ etiqueta: r.etiqueta, pct: r.pct, color: r.color })) : null;
}
var ALTO_MAPA = Math.round(CONT * 9 / 16);

// lib/proyecto-pdf.tsx
var import_renderer2 = require("@react-pdf/renderer");
var import_jsx_runtime2 = __toESM(require_jsx_runtime());
var ETIQUETA_SECCION_ROL = {
  poi_propio: ["POIs", "Los puntos de inter\xE9s del plan"],
  competencia: ["Competencia", "D\xF3nde est\xE1 la competencia y cu\xE1nta gente comparte territorio"],
  proximidad: ["Proximidad", "El universo cerca de tus puntos de venta"],
  ooh: ["Plan OOH", "Pantallas que apoyan a los puntos de venta"],
  // exploración nunca llega al PDF (se promueve antes); clave requerida
  exploracion: ["Exploraci\xF3n", "B\xFAsquedas exploratorias del plan"],
  geotargeting: ["Geo-Targeting", "CPs de cobertura + keywords"]
};
var NOMBRE_ROL = {
  poi_propio: "POIs",
  competencia: "Competencia",
  proximidad: "Proximidad",
  ooh: "Pantallas",
  exploracion: "Exploraci\xF3n",
  geotargeting: "Geo-Targeting"
};
var ORDEN_ROLES = ["poi_propio", "competencia", "proximidad"];
var FILAS_PROPIOS = 12;
var FILAS_PANTALLAS = 12;
var MAX_SIN_COBERTURA = 12;
var EJEMPLOS_PROXIMIDAD = 6;
var FILAS_DETALLE_PROX = 20;
var NOTA_TRASLAPE_DETALLE = "Universo del radio individual de cada punto; los radios cercanos comparten poblaci\xF3n (la suma de individuales excede al consolidado deduplicado) \u2014 para presupuesto son pesos relativos, no poblaciones exclusivas.";
var ALTO_MAPA_OOH = Math.round(CONT * 7 / 16);
var TEAL = "#0f766e";
var radioTextoGeo = (m) => m >= 1e3 ? `${m / 1e3} km` : `${m} m`;
var totalKeywordsGeo = (k) => k ? k.marca + k.industria + k.competencia : 0;
var adultos = (u) => u?.disponible ? u.residencial?.adultos18 ?? 0 : 0;
function cpTop(pois) {
  const conCp = pois.filter((p) => p.cp);
  if (conCp.length < pois.length / 2 || conCp.length === 0) return null;
  const conteo = /* @__PURE__ */ new Map();
  conCp.forEach((p) => conteo.set(p.cp, (conteo.get(p.cp) ?? 0) + 1));
  return Array.from(conteo.entries()).sort((a, b) => b[1] - a[1])[0];
}
function pctNseAlto(u) {
  const dist = u?.disponible ? u.perfil?.nseDist : null;
  if (!dist) return null;
  return (dist.ab ?? 0) + (dist.c_mas ?? 0);
}
function hallazgosProyecto(d) {
  const salida = [];
  const propios = d.capas.filter((c) => c.rol === "poi_propio");
  const competencia = d.capas.filter((c) => c.rol === "competencia");
  const proximidad = d.capas.filter((c) => c.rol === "proximidad");
  const poisComp = competencia.flatMap((c) => c.pois);
  const poisProp = propios.flatMap((c) => c.pois);
  const topComp = cpTop(poisComp);
  if (topComp && poisProp.length > 0) {
    const propiosAhi = poisProp.filter((p) => p.cp === topComp[0]).length;
    const pctComp = Math.round(100 * topComp[1] / poisComp.length);
    const pctProp = Math.round(100 * propiosAhi / poisProp.length);
    if (pctComp - pctProp >= 10) {
      salida.push(
        `La competencia se concentra en CP ${topComp[0]} (${fmt(topComp[1])} puntos, ${pctComp}%) donde tu cobertura es menor (${fmt(propiosAhi)} puntos propios, ${pctProp}%).`
      );
    }
  }
  const nseProx = pctNseAlto(proximidad[0]?.universo ?? null);
  const nseProp = pctNseAlto(propios[0]?.universo ?? null);
  if (nseProx !== null && nseProp !== null && Math.abs(nseProx - nseProp) >= 5) {
    salida.push(
      nseProx > nseProp ? `El NSE del territorio de proximidad supera al de tus puntos: ${nseProx.toLocaleString("es-MX")}% en niveles AB/C+ contra ${nseProp.toLocaleString("es-MX")}%.` : `Tus puntos est\xE1n en territorio de mejor NSE que el de proximidad: ${nseProp.toLocaleString("es-MX")}% en AB/C+ contra ${nseProx.toLocaleString("es-MX")}%.`
    );
  }
  const conquista = d.traslapes.find((t) => t.esConquista);
  if (conquista && conquista.poblacion > 0) {
    salida.push(
      `${fmt(conquista.poblacion)} personas (${conquista.pctBase.toLocaleString("es-MX")}%) de tu territorio tambi\xE9n est\xE1n en zona de competencia \u2014 audiencia directa de conquista.`
    );
  }
  if (salida.length < 2) {
    const nse = segmentosNse(d.consolidado);
    if (nse) {
      const top = [...nse].sort((a, b) => b.pct - a.pct)[0];
      salida.push(
        `Nivel socioecon\xF3mico dominante del territorio consolidado: ${top.etiqueta}, con ${top.pct.toLocaleString("es-MX")}% (\xEDndice proxy censal).`
      );
    }
  }
  return salida.slice(0, 3);
}
function sustentoTactica(clave, d) {
  const puntosDe = (rol) => d.capas.filter((c) => c.rol === rol).reduce((t, c) => t + c.pois.length, 0);
  switch (clave) {
    case "poi": {
      const n = puntosDe("poi_propio");
      return n > 0 ? `sobre los ${fmt(n)} puntos propios del proyecto` : null;
    }
    case "conquista": {
      const n = puntosDe("competencia");
      return n > 0 ? `sobre los ${fmt(n)} puntos de competencia censados` : null;
    }
    case "proximidad": {
      const n = puntosDe("proximidad");
      return n > 0 ? `sobre los ${fmt(n)} puntos de proximidad` : null;
    }
    case "pdooh":
      return d.ooh ? `con las ${fmt(d.ooh.pantallas.length)} pantallas del cruce OOH` : null;
    case "targeting":
      return d.geoTargeting ? `${fmt(d.geoTargeting.cps)} CPs de cobertura${d.geoTargeting.keywords > 0 ? ` \xB7 bulk de ${fmt(d.geoTargeting.keywords)} keywords en 3 grupos (propuesta IA editable)` : ""}` : `sobre el universo consolidado de ${fmt(adultos(d.consolidado))} adultos 18+`;
    case "trade": {
      const n = puntosDe("poi_propio");
      return n > 0 ? `para expandir el territorio desde tus ${fmt(n)} puntos` : null;
    }
    default:
      return null;
  }
}
function lineaPdvsProyecto(p, maxChars = 62) {
  const partes = [];
  let usados = 0;
  let n = 0;
  for (const rel of p.pdvs) {
    const km = (rel.distancia_m / 1e3).toLocaleString("es-MX", {
      maximumFractionDigits: 1
    });
    const parte = `${rel.nombre} (${km} km)`;
    if (usados + parte.length > maxChars && n > 0) break;
    partes.push(parte);
    usados += parte.length + 3;
    n++;
  }
  const resto = p.pdvs.length - n;
  return partes.join(" \xB7 ") + (resto > 0 ? `  +${resto}` : "");
}
function universoDeRol(d, rol) {
  const calculado = d.universoRol?.[rol];
  if (calculado?.disponible) return calculado;
  const capasRol = d.capas.filter((c) => c.rol === rol);
  if (capasRol.length === 1 && capasRol[0].universo?.disponible) {
    return capasRol[0].universo;
  }
  return null;
}
function altoBloqueDemografico(u) {
  if (!u?.disponible || !u.residencial) return 0;
  return 28 + // padding del panel
  64 + // fila de cifras
  (segmentosNse(u) ? 62 : 0) + (segmentosEdades(u) ? 62 : 0) + (u.criterio ? 16 : 0) + 16;
}
function BloqueDemografico({ u }) {
  if (!u?.disponible || !u.residencial) return null;
  const nse = segmentosNse(u);
  const edades = segmentosEdades(u);
  const pobRural = u.residencial.pobRural ?? 0;
  const pob = u.residencial.poblacion || 1;
  const pctRural = Math.round(100 * pobRural / pob);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    import_renderer2.View,
    {
      style: {
        backgroundColor: PANEL,
        borderRadius: 8,
        paddingTop: 14,
        paddingBottom: 14,
        paddingLeft: 14,
        paddingRight: 14,
        marginTop: 2,
        marginBottom: 16
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flexDirection: "row" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            Cifra,
            {
              valor: fmt(u.residencial.adultos18),
              descriptor: "Universo de la t\xE1ctica \xB7 adultos 18+"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            Cifra,
            {
              valor: pobRural > 0 ? `${100 - pctRural}% / ${pctRural}%` : "100%",
              descriptor: pobRural > 0 ? "urbano / rural (ITER 2020)" : "poblaci\xF3n urbana"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Cifra, { valor: fmt(u.agebs ?? 0), descriptor: "Zonas censales" })
        ] }),
        nse && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { marginTop: 12 }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          BarraApilada,
          {
            titulo: "NSE de la t\xE1ctica (proxy censal, no AMAI)",
            segmentos: nse,
            width: CONT - 28
          }
        ) }),
        edades && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { marginTop: 10 }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          BarraApilada,
          {
            titulo: "Edades \xB7 % del universo 18+ (25-64: estimaci\xF3n con estructura nacional)",
            segmentos: edades,
            width: CONT - 28
          }
        ) }),
        u.criterio && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "DMMono", fontSize: 7, color: GRIS_OSCURO, marginTop: 8 }, children: u.criterio })
      ]
    }
  );
}
function SeparadorSeccion() {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { marginTop: 2, marginBottom: 22 }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Divisor, {}) });
}
function estimarAltura(d, titulo) {
  const u = d.consolidado.disponible ? d.consolidado : null;
  const lineasTitulo = Math.max(1, Math.ceil(titulo.length / 42));
  let h = MARGEN;
  h += 56 + lineasTitulo * 34 + 78;
  h += 96;
  h += 34;
  h += 24 + 18 * Math.max(1, Math.ceil((d.capas.length + (d.ooh ? 1 : 0)) / 3));
  if (segmentosNse(u)) h += 62;
  if (segmentosEdades(u)) h += 62;
  h += 46;
  if (d.mapaDataUrl) h += 44 + ALTO_MAPA + 22 + 26;
  const propios = d.capas.filter((c) => c.rol === "poi_propio");
  const competencia = d.capas.filter((c) => c.rol === "competencia");
  const proximidad = d.capas.filter((c) => c.rol === "proximidad");
  if (propios.length > 0) {
    const filas = Math.min(
      propios.reduce((t, c) => t + c.pois.length, 0),
      FILAS_PROPIOS
    );
    h += 26 + 60 + altoBloqueDemografico(universoDeRol(d, "poi_propio"));
    h += 20 + 16 + filas * 15.5 + 26;
  }
  if (competencia.length > 0) {
    h += 26 + 60 + altoBloqueDemografico(universoDeRol(d, "competencia"));
    h += competencia.length * 20 + 14;
    if (d.traslapes.some((t) => t.esConquista)) h += 78;
    h += d.traslapes.filter((t) => !t.esConquista).length * 20 + 14;
  }
  if (proximidad.length > 0) {
    h += 26 + 60 + altoBloqueDemografico(universoDeRol(d, "proximidad"));
    h += proximidad.length * 20 + 34;
    const detProx = proximidad.reduce(
      (t, c) => t + (d.detallePuntos?.[c.id]?.filter((f) => f.universo != null).length ?? 0),
      0
    );
    if (detProx > 0) {
      h += 24 + Math.min(detProx, FILAS_DETALLE_PROX) * 14 + 46;
    }
  }
  if (d.ooh) {
    h += 26 + 60 + 78;
    h += altoBloqueDemografico(universoDeRol(d, "ooh"));
    if (d.ooh.mapaDataUrl) h += ALTO_MAPA_OOH + 18;
    const filas = Math.min(d.ooh.pantallas.length, FILAS_PANTALLAS);
    h += 20 + filas * 15.5 + 22;
    if (d.ooh.sinCobertura.length > 0)
      h += 26 + Math.min(d.ooh.sinCobertura.length, MAX_SIN_COBERTURA) * 13 + 18;
  }
  if (d.geoSeccion) {
    h += 26 + 60 + 22;
    h += altoBloqueDemografico(d.geoSeccion.universo);
    h += 78;
    if (d.geoSeccion.mapaDataUrl) h += ALTO_MAPA_OOH + 18;
    if (d.geoSeccion.municipios.length > 0) h += 22;
    if (d.geoSeccion.keywords) h += 48;
    h += 24;
  }
  const comparables = d.capas.filter(
    (c) => c.universo?.disponible && c.universo.perfil?.nseDist
  );
  h += 26 + 60;
  if (comparables.length >= 2) h += 18 + comparables.length * 48 + 12;
  h += hallazgosProyecto(d).length * 52 + 26;
  h += 52 + Math.ceil(CLAVES_TACTICAS.length / 2) * (ALTO_PILL + 16) + 30;
  h += d.tacticas.filter((t) => sustentoTactica(t, d)).length * 15 + 12;
  h += 200;
  h += 46 + Math.max(150, 26 + d.fuentes.length * 13 + 60) + 2;
  return Math.ceil(h + 130);
}
function ProyectoDocumento({ d }) {
  const titulo = d.titulo?.trim() || `Plan territorial \u2014 ${d.cliente}`;
  const fechaLarga = d.fecha.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  const u = d.consolidado.disponible ? d.consolidado : null;
  const hayRural = (u?.rurales ?? 0) > 0 || (u?.residencial?.pobRural ?? 0) > 0;
  const nse = segmentosNse(u);
  const edades = segmentosEdades(u);
  const tacticas = ordenarTacticas(d.tacticas);
  const sustentos = d.tacticas.map((clave) => ({ clave, texto: sustentoTactica(clave, d) })).filter((s) => !!s.texto);
  const totalPuntos = d.capas.reduce((t, c) => t + c.pois.length, 0) + (d.ooh?.pantallas.length ?? 0);
  const listaHallazgos = hallazgosProyecto(d);
  const altura = estimarAltura(d, titulo);
  const traslapeEstrella = d.traslapes.find((t) => t.esConquista) ?? null;
  const otrosTraslapes = d.traslapes.filter((t) => !t.esConquista);
  const conteosRol = ORDEN_ROLES.filter(
    (rol) => d.capas.some((c) => c.rol === rol)
  ).map((rol) => {
    const capasRol = d.capas.filter((c) => c.rol === rol);
    const total = capasRol.reduce((t, c) => t + c.pois.length, 0);
    const detalle = capasRol.length > 1 ? ` (${capasRol.map((c) => `${c.nombre} ${fmt(c.pois.length)}`).join(" \xB7 ")})` : "";
    return { rol, texto: `${NOMBRE_ROL[rol]}: ${fmt(total)}${detalle}` };
  });
  if (d.ooh) {
    conteosRol.push({
      rol: "ooh",
      texto: `${NOMBRE_ROL.ooh}: ${fmt(d.ooh.pantallas.length)}`
    });
  }
  if (d.geoSeccion) {
    conteosRol.push({
      rol: "geotargeting",
      texto: `${NOMBRE_ROL.geotargeting}: ${fmt(d.geoSeccion.cps)} CPs`
    });
  }
  const propios = d.capas.filter((c) => c.rol === "poi_propio");
  const competencia = d.capas.filter((c) => c.rol === "competencia");
  const proximidad = d.capas.filter((c) => c.rol === "proximidad");
  const poisPropios = propios.flatMap((c) => c.pois);
  const filasPropios = [...poisPropios].sort((a, b) => (a.cp ?? "").localeCompare(b.cp ?? "") || a.nombre.localeCompare(b.nombre)).slice(0, FILAS_PROPIOS);
  const comparables = d.capas.filter(
    (c) => c.universo?.disponible && c.universo.perfil?.nseDist
  );
  const filasOoh = d.ooh ? [...d.ooh.pantallas].sort((a, b) => b.pdvs.length - a.pdvs.length).slice(0, FILAS_PANTALLAS) : [];
  const sinCob = d.ooh?.sinCobertura.slice(0, MAX_SIN_COBERTURA) ?? [];
  const celdaTh = {
    fontFamily: "DMMono",
    fontWeight: 500,
    fontSize: 7,
    letterSpacing: 1.3,
    color: GRIS_OSCURO
  };
  const celdaTd = { fontFamily: "Montserrat", fontSize: 8, color: TINTA };
  const labelCol = {
    fontFamily: "DMMono",
    fontWeight: 500,
    fontSize: 7.5,
    letterSpacing: 1.8,
    color: GRIS,
    marginBottom: 8
  };
  const lectura = {
    fontFamily: "Montserrat",
    fontSize: 9,
    color: GRIS,
    marginTop: -6,
    marginBottom: 8
  };
  const puntoCapa = (color) => ({
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: color,
    marginRight: 6
  });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Document, { title: titulo, author: "Gravity \xB7 Link Studio", creator: "Seeker", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Page, { size: [ANCHO_PAG, altura], style: { backgroundColor: FONDO, padding: MARGEN }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Neon, { height: 150 }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Firma, { height: 26 }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "DMMono", fontSize: 8, letterSpacing: 1.4, color: GRIS }, children: "powered by linkstudio" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { marginTop: 26 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "DMMono", fontWeight: 500, fontSize: 9.5, letterSpacing: 3, color: MAGENTA }, children: [
        "PLAN TERRITORIAL \u2014 ",
        d.cliente.toUpperCase()
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontWeight: 800, fontSize: 28, color: BLANCO, marginTop: 8 }, children: titulo }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontSize: 11, color: GRIS, marginTop: 8 }, children: "Conectamos intenci\xF3n con visitas." }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "DMMono", fontSize: 8.5, color: GRIS_OSCURO, marginTop: 10 }, children: [
        fechaLarga,
        " \xB7 Generado por ",
        d.usuario
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { marginTop: 22, marginBottom: 26 }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Divisor, {}) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flexDirection: "row" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Cifra,
        {
          valor: u ? fmt(u.residencial.adultos18) : "\u2014",
          descriptor: "Universo consolidado \xB7 adultos 18+"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Cifra, { valor: fmt(totalPuntos), descriptor: "Puntos en el proyecto" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Cifra,
        {
          valor: fmt(d.nLevantamientos),
          descriptor: "Levantamientos consolidados"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Cifra,
        {
          valor: u ? fmt(u.agebs ?? 0) : "\u2014",
          descriptor: "Zonas censales analizadas"
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontSize: 9, color: GRIS, marginTop: 12, lineHeight: 1.5 }, children: [
      "Universo de la uni\xF3n de los territorios seleccionados, deduplicando traslapes entre capas",
      d.sumaSimple > adultos(u) && u ? `: la suma simple de los universos individuales dar\xEDa ${fmt(d.sumaSimple)} adultos 18+; el consolidado real es ${fmt(adultos(u))} (\u2212${fmt(d.sumaSimple - adultos(u))} por traslapes).` : "."
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { flexDirection: "row", flexWrap: "wrap", marginTop: 12, alignItems: "center" }, children: conteosRol.map((c, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flexDirection: "row", alignItems: "center", marginRight: 10, marginBottom: 4 }, children: [
      i > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "DMMono", fontSize: 9, color: GRIS_OSCURO, marginRight: 10 }, children: "\xB7" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "DMMono", fontSize: 9, color: TINTA }, children: c.texto })
    ] }, c.rol)) }),
    nse && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { marginTop: 16 }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(BarraApilada, { titulo: "Nivel socioecon\xF3mico del consolidado (proxy censal, no AMAI)", segmentos: nse, width: CONT }) }),
    edades && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { marginTop: 14 }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(BarraApilada, { titulo: "Edades \xB7 % del universo 18+ consolidado (25-64: estimaci\xF3n con estructura nacional)", segmentos: edades, width: CONT }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "DMMono", fontSize: 7.5, color: GRIS_OSCURO, marginTop: 12 }, children: u ? `Censo 2020 INEGI \xB7 ${fmt(u.agebs ?? 0)} zonas censales${(u.rurales ?? 0) > 0 ? ` \xB7 ${fmt(u.rurales)} localidades rurales (ITER)` : ""}${u.criterio ? ` \xB7 ${u.criterio}` : ""}` : "Universo consolidado no disponible" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { marginTop: 18, marginBottom: 24 }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Divisor, {}) }),
    d.mapaDataUrl && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { marginBottom: 26 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Seccion, { etiqueta: "Mapa general", titulo: "Todas las capas del proyecto" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_renderer2.Image,
        {
          src: d.mapaDataUrl,
          style: { width: CONT, height: ALTO_MAPA, borderRadius: 8, objectFit: "cover" }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 }, children: [
        d.capas.map((c) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flexDirection: "row", alignItems: "center", marginRight: 12, marginBottom: 3 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.color, marginRight: 4 } }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "DMMono", fontSize: 8, color: GRIS }, children: [
            c.nombre,
            " \xB7 ",
            NOMBRE_ROL[c.rol]
          ] })
        ] }, c.id)),
        d.ooh && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flexDirection: "row", alignItems: "center", marginRight: 12, marginBottom: 3 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { width: 6, height: 6, backgroundColor: "#e2711d", marginRight: 4 } }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "DMMono", fontSize: 8, color: GRIS }, children: "Pantallas OOH (l\xEDneas = a qu\xE9 PDV apoyan)" })
        ] })
      ] })
    ] }),
    propios.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { marginBottom: 26 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SeparadorSeccion, {}),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Seccion,
        {
          etiqueta: ETIQUETA_SECCION_ROL.poi_propio[0],
          titulo: ETIQUETA_SECCION_ROL.poi_propio[1]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: lectura, children: [
        fmt(poisPropios.length),
        " puntos de inter\xE9s",
        cpTop(poisPropios) ? ` \xB7 mayor concentraci\xF3n en CP ${cpTop(poisPropios)[0]} (${fmt(cpTop(poisPropios)[1])})` : "",
        "."
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(BloqueDemografico, { u: universoDeRol(d, "poi_propio") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: LINEA, paddingBottom: 4 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTh, { width: 210 }], children: "NOMBRE" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTh, { flex: 1 }], children: "DIRECCI\xD3N" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTh, { width: 60 }], children: "CP" })
      ] }),
      filasPropios.map((p, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        import_renderer2.View,
        {
          style: {
            flexDirection: "row",
            paddingTop: 3,
            paddingBottom: 3,
            backgroundColor: i % 2 === 1 ? PANEL : void 0
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTd, { width: 210, color: BLANCO }], children: p.nombre.length > 36 ? p.nombre.slice(0, 35) + "\u2026" : p.nombre }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTd, { flex: 1, color: GRIS }], children: p.direccion.length > 58 ? p.direccion.slice(0, 57) + "\u2026" : p.direccion }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTd, { width: 60, fontFamily: "DMMono", color: CIAN }], children: p.cp ?? "\u2014" })
          ]
        },
        p.placeId
      )),
      poisPropios.length > filasPropios.length && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "DMMono", fontSize: 7.5, color: GRIS_OSCURO, marginTop: 6 }, children: [
        "+",
        fmt(poisPropios.length - filasPropios.length),
        " puntos m\xE1s \u2014 detalle completo en el Export data (Excel)."
      ] })
    ] }),
    competencia.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { marginBottom: 26 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SeparadorSeccion, {}),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Seccion,
        {
          etiqueta: ETIQUETA_SECCION_ROL.competencia[0],
          titulo: ETIQUETA_SECCION_ROL.competencia[1]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(BloqueDemografico, { u: universoDeRol(d, "competencia") }),
      competencia.map((c) => {
        const top = cpTop(c.pois);
        return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flexDirection: "row", alignItems: "center", marginBottom: 6 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: puntoCapa(c.color) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontWeight: 800, fontSize: 11, color: BLANCO, width: 190 }, children: c.nombre }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "DMMono", fontSize: 9, color: MAGENTA, width: 84 }, children: [
            fmt(c.pois.length),
            " puntos"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontSize: 8.5, color: GRIS, flex: 1 }, children: [
            adultos(c.universo) > 0 ? `universo ${fmt(adultos(c.universo))} \xB7 ` : "",
            top ? `mayor concentraci\xF3n en CP ${top[0]} (${fmt(top[1])})` : "distribuida en el territorio"
          ] })
        ] }, c.id);
      }),
      traslapeEstrella && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        import_renderer2.View,
        {
          style: {
            backgroundColor: PANEL,
            borderLeftWidth: 3,
            borderLeftColor: MAGENTA,
            borderRadius: 6,
            paddingTop: 10,
            paddingBottom: 10,
            paddingLeft: 14,
            paddingRight: 14,
            marginTop: 8
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "DMMono", fontWeight: 500, fontSize: 7, letterSpacing: 1.8, color: MAGENTA, marginBottom: 5 }, children: "TRASLAPE PROPIOS \xD7 COMPETENCIA \u2014 LA AUDIENCIA DE CONQUISTA" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontWeight: 800, fontSize: 15, color: BLANCO }, children: [
              fmt(traslapeEstrella.poblacion),
              " personas \u2014 el ",
              traslapeEstrella.pctBase.toLocaleString("es-MX"),
              "% del universo de ",
              traslapeEstrella.etiquetaBase,
              " \u2014 est\xE1n en ambos territorios."
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontSize: 8, color: GRIS, marginTop: 4 }, children: [
              "% sobre el universo de ",
              traslapeEstrella.etiquetaBase,
              " (",
              fmt(traslapeEstrella.poblacionBase),
              " personas, el menor del par). C\xE1lculo por inclusi\xF3n-exclusi\xF3n sobre el censo."
            ] })
          ]
        }
      ),
      otrosTraslapes.map((t, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontSize: 8.5, color: GRIS, marginTop: 6 }, children: [
        "Traslape ",
        t.etiquetaA,
        " \xD7 ",
        t.etiquetaB,
        ":",
        " ",
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { color: TINTA }, children: [
          fmt(t.poblacion),
          " personas"
        ] }),
        " ",
        "(",
        t.pctBase.toLocaleString("es-MX"),
        "% del universo de ",
        t.etiquetaBase,
        ", el menor del par)."
      ] }, i))
    ] }),
    proximidad.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { marginBottom: 26 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SeparadorSeccion, {}),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Seccion,
        {
          etiqueta: ETIQUETA_SECCION_ROL.proximidad[0],
          titulo: ETIQUETA_SECCION_ROL.proximidad[1]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(BloqueDemografico, { u: universoDeRol(d, "proximidad") }),
      proximidad.map((c) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flexDirection: "row", alignItems: "center", marginBottom: 6 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: puntoCapa(c.color) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontWeight: 800, fontSize: 11, color: BLANCO, width: 190 }, children: c.nombre }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "DMMono", fontSize: 9, color: VIOLETA, width: 84 }, children: [
          fmt(c.pois.length),
          " puntos"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontSize: 8.5, color: GRIS, flex: 1 }, children: adultos(c.universo) > 0 ? `universo ${fmt(adultos(c.universo))} adultos 18+ en su zona` : "puntos de venta / lugares de referencia" })
      ] }, c.id)),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontSize: 8.5, color: GRIS, marginTop: 4, lineHeight: 1.5 }, children: [
        "Ejemplos:",
        " ",
        proximidad.flatMap((c) => c.pois).slice(0, EJEMPLOS_PROXIMIDAD).map((p) => p.nombre).join(" \xB7 "),
        "."
      ] }),
      (() => {
        const filasDet = proximidad.flatMap((c) => d.detallePuntos?.[c.id] ?? []).filter((f) => f.universo != null);
        if (filasDet.length === 0) return null;
        const suma = filasDet.reduce((t, f) => t + (f.universo ?? 0), 0);
        const top = [...filasDet].sort((a, b) => (b.universo ?? 0) - (a.universo ?? 0)).slice(0, FILAS_DETALLE_PROX);
        return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { marginTop: 12 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: labelCol, children: [
            "DETALLE POR PDV \u2014 BASE DE PRESUPUESTO (",
            fmt(filasDet.length),
            " PUNTOS)"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: LINEA, paddingBottom: 3 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTh, { flex: 1 }], children: "PDV" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTh, { width: 74 }], children: "CIUDAD" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTh, { width: 76, textAlign: "right" }], children: "UNIVERSO 18+" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTh, { width: 34, textAlign: "right" }], children: "NSE" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTh, { width: 70, textAlign: "right" }], children: "% DEL UNIVERSO" })
          ] }),
          top.map((f, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
            import_renderer2.View,
            {
              style: {
                flexDirection: "row",
                paddingTop: 2.5,
                paddingBottom: 2.5,
                backgroundColor: i % 2 === 1 ? PANEL : void 0
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTd, { flex: 1, color: BLANCO }], children: f.nombre.length > 42 ? f.nombre.slice(0, 41) + "\u2026" : f.nombre }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTd, { width: 74, color: GRIS }], children: f.ciudad.length > 13 ? f.ciudad.slice(0, 12) + "\u2026" : f.ciudad }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTd, { width: 76, textAlign: "right", fontFamily: "DMMono", color: CIAN }], children: f.universo != null ? fmt(f.universo) : "\u2014" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTd, { width: 34, textAlign: "right", fontFamily: "DMMono", color: VIOLETA }], children: f.nse ?? "\u2014" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTd, { width: 70, textAlign: "right", fontFamily: "DMMono", color: GRIS }], children: f.universo != null && suma > 0 ? `${(100 * f.universo / suma).toLocaleString("es-MX", { maximumFractionDigits: 1 })}%` : "\u2014" })
              ]
            },
            `${f.nombre}-${i}`
          )),
          filasDet.length > top.length && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "DMMono", fontSize: 7.5, color: GRIS_OSCURO, marginTop: 5 }, children: [
            "+",
            fmt(filasDet.length - top.length),
            " PDVs m\xE1s \u2014 detalle completo con % del universo en el Export data (Excel)."
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontSize: 7.5, color: GRIS_OSCURO, marginTop: 5, lineHeight: 1.45 }, children: NOTA_TRASLAPE_DETALLE })
        ] });
      })()
    ] }),
    d.ooh && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { marginBottom: 26 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SeparadorSeccion, {}),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Seccion,
        {
          etiqueta: ETIQUETA_SECCION_ROL.ooh[0],
          titulo: ETIQUETA_SECCION_ROL.ooh[1]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(BloqueDemografico, { u: universoDeRol(d, "ooh") }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flexDirection: "row", marginBottom: 12 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Cifra, { valor: fmt(d.ooh.pantallas.length), descriptor: "Pantallas en el plan" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          Cifra,
          {
            valor: `${fmt(d.ooh.cubiertos)} de ${fmt(d.ooh.totalPdvs)}`,
            descriptor: "PDVs cubiertos"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          Cifra,
          {
            valor: fmt(Math.max(0, d.ooh.totalPdvs - d.ooh.cubiertos)),
            descriptor: "PDVs sin cobertura"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          Cifra,
          {
            valor: d.ooh.impresiones != null && d.ooh.impresiones > 0 ? fmt(d.ooh.impresiones) : "\u2014",
            descriptor: "Impresiones mensuales"
          }
        )
      ] }),
      d.ooh.mapaDataUrl && /* eslint-disable-next-line jsx-a11y/alt-text */
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_renderer2.Image,
        {
          src: d.ooh.mapaDataUrl,
          style: { width: CONT, height: ALTO_MAPA_OOH, borderRadius: 8, objectFit: "cover", marginBottom: 12 }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: LINEA, paddingBottom: 4 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTh, { width: 170 }], children: "PANTALLA" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTh, { width: 78 }], children: "TIPO" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTh, { width: 36, textAlign: "right" }], children: "PDVS" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTh, { flex: 1, paddingLeft: 14 }], children: "APOYA A" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTh, { width: 58, textAlign: "right" }], children: "IMPR./MES" })
      ] }),
      filasOoh.map((p, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        import_renderer2.View,
        {
          style: {
            flexDirection: "row",
            paddingTop: 3,
            paddingBottom: 3,
            backgroundColor: i % 2 === 1 ? PANEL : void 0
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTd, { width: 170, color: BLANCO }], children: p.nombre.length > 30 ? p.nombre.slice(0, 29) + "\u2026" : p.nombre }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTd, { width: 78, color: "#e2711d" }], children: (p.tipo ?? "\u2014").slice(0, 14) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTd, { width: 36, textAlign: "right", fontFamily: "DMMono", color: CIAN }], children: p.pdvs.length }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTd, { flex: 1, paddingLeft: 14, color: GRIS }], children: lineaPdvsProyecto(p) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTd, { width: 58, textAlign: "right", fontFamily: "DMMono", color: GRIS }], children: p.impresiones != null ? fmt(p.impresiones) : "\u2014" })
          ]
        },
        `${p.nombre}-${i}`
      )),
      d.ooh.pantallas.length > filasOoh.length && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "DMMono", fontSize: 7.5, color: GRIS_OSCURO, marginTop: 6 }, children: [
        "+",
        fmt(d.ooh.pantallas.length - filasOoh.length),
        " pantallas m\xE1s \u2014 detalle completo en el Export data (Excel)."
      ] }),
      sinCob.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { marginTop: 14 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: labelCol, children: [
          "PDVS SIN COBERTURA \u2014 D\xD3NDE FALTA INVENTARIO (",
          fmt(d.ooh.sinCobertura.length),
          ")"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          import_renderer2.View,
          {
            style: {
              backgroundColor: PANEL,
              borderLeftWidth: 2,
              borderLeftColor: MAGENTA,
              borderRadius: 6,
              paddingTop: 8,
              paddingBottom: 8,
              paddingLeft: 11,
              paddingRight: 11
            },
            children: [
              sinCob.map((n) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontSize: 8.5, color: TINTA, marginBottom: 3 }, children: [
                "\xB7 ",
                n
              ] }, n)),
              d.ooh.sinCobertura.length > sinCob.length && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "DMMono", fontSize: 7.5, color: GRIS_OSCURO }, children: [
                "+",
                fmt(d.ooh.sinCobertura.length - sinCob.length),
                " m\xE1s en el Export data (Excel)."
              ] })
            ]
          }
        )
      ] })
    ] }),
    d.geoSeccion && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { marginBottom: 26 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SeparadorSeccion, {}),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Seccion,
        {
          etiqueta: ETIQUETA_SECCION_ROL.geotargeting[0],
          titulo: ETIQUETA_SECCION_ROL.geotargeting[1]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: lectura, children: [
        fmt(d.geoSeccion.cps),
        " c\xF3digos postales cuyo pol\xEDgono intersecta los radios de ",
        radioTextoGeo(d.geoSeccion.radio),
        " ",
        "alrededor de ",
        d.geoSeccion.origen,
        " \u2014 la lista va directo al DSP (keyword/contextual targeting por CP)."
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(BloqueDemografico, { u: d.geoSeccion.universo }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flexDirection: "row", marginBottom: 12 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Cifra, { valor: fmt(d.geoSeccion.cps), descriptor: "CPs de cobertura" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          Cifra,
          {
            valor: radioTextoGeo(d.geoSeccion.radio),
            descriptor: "Radio por PDV"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          Cifra,
          {
            valor: d.geoSeccion.municipios.length > 0 ? fmt(d.geoSeccion.municipios.length) : "\u2014",
            descriptor: "Municipios principales"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          Cifra,
          {
            valor: totalKeywordsGeo(d.geoSeccion.keywords) > 0 ? fmt(totalKeywordsGeo(d.geoSeccion.keywords)) : "\u2014",
            descriptor: "Keywords (propuesta IA)"
          }
        )
      ] }),
      d.geoSeccion.mapaDataUrl && /* eslint-disable-next-line jsx-a11y/alt-text */
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        import_renderer2.Image,
        {
          src: d.geoSeccion.mapaDataUrl,
          style: { width: CONT, height: ALTO_MAPA_OOH, borderRadius: 8, objectFit: "cover", marginBottom: 12 }
        }
      ),
      d.geoSeccion.municipios.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontSize: 8.5, color: GRIS, marginBottom: 6, lineHeight: 1.5 }, children: [
        "Municipios con m\xE1s cobertura:",
        " ",
        d.geoSeccion.municipios.map((m) => `${m.municipio} (${fmt(m.cps)} CPs)`).join(" \xB7 "),
        "."
      ] }),
      d.geoSeccion.keywords && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        import_renderer2.View,
        {
          style: {
            backgroundColor: PANEL,
            borderLeftWidth: 3,
            borderLeftColor: TEAL,
            borderRadius: 6,
            paddingTop: 9,
            paddingBottom: 9,
            paddingLeft: 14,
            paddingRight: 14,
            marginTop: 2
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "DMMono", fontWeight: 500, fontSize: 7, letterSpacing: 1.8, color: TEAL, marginBottom: 4 }, children: "BULK DE KEYWORDS \u2014 PROPUESTA IA EDITABLE" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontSize: 9, color: TINTA, lineHeight: 1.5 }, children: [
              fmt(totalKeywordsGeo(d.geoSeccion.keywords)),
              " keywords en",
              " ",
              d.geoSeccion.keywords.competencia > 0 ? "3" : "2",
              " grupos: marca ",
              fmt(d.geoSeccion.keywords.marca),
              " \xB7 industria",
              " ",
              fmt(d.geoSeccion.keywords.industria),
              d.geoSeccion.keywords.competencia > 0 ? ` \xB7 competencia ${fmt(d.geoSeccion.keywords.competencia)}` : "",
              " ",
              "\u2014 generadas con el contexto del plan; no son data de volumen de b\xFAsqueda."
            ] })
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "DMMono", fontSize: 7.5, color: GRIS_OSCURO, marginTop: 8 }, children: "Lista completa de CPs, bulk de keywords y pol\xEDgonos (.geojson) en el Export data del proyecto." })
    ] }),
    (comparables.length >= 2 || listaHallazgos.length > 0) && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { marginBottom: 4 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SeparadorSeccion, {}),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        Seccion,
        {
          etiqueta: "Inteligencia territorial",
          titulo: "C\xF3mo se comparan las capas del proyecto"
        }
      ),
      comparables.length >= 2 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { marginBottom: 16 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flexDirection: "row", marginBottom: 6 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTh, { width: 226 }], children: "CAPA \xB7 UNIVERSO 18+ PROPIO" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTh, { width: (CONT - 226 - 16 - 20) / 2, marginRight: 20 }], children: "NSE (PROXY CENSAL)" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [celdaTh, { width: (CONT - 226 - 16 - 20) / 2 }], children: "EDADES \xB7 % DEL UNIVERSO 18+" })
        ] }),
        comparables.map((c) => {
          const nseCapa = segmentosNse(c.universo);
          const edadesCapa = segmentosEdades(c.universo);
          const wBarra = (CONT - 226 - 16 - 20) / 2;
          return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
            import_renderer2.View,
            {
              style: {
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: PANEL,
                borderLeftWidth: 3,
                borderLeftColor: c.color,
                borderRadius: 6,
                paddingTop: 8,
                paddingBottom: 8,
                paddingLeft: 10,
                paddingRight: 6,
                marginBottom: 7
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { width: 216 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flexDirection: "row", alignItems: "center" }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: puntoCapa(c.color) }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontWeight: 800, fontSize: 10, color: BLANCO }, children: c.nombre.length > 26 ? c.nombre.slice(0, 25) + "\u2026" : c.nombre })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "DMMono", fontSize: 7.5, color: GRIS, marginTop: 3 }, children: [
                    NOMBRE_ROL[c.rol],
                    " \xB7",
                    " ",
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { color: CIAN }, children: fmt(adultos(c.universo)) }),
                    " ",
                    "adultos 18+ \xB7 ",
                    fmt(c.pois.length),
                    " puntos"
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { width: wBarra, marginRight: 20 }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { flexDirection: "row", height: 9, borderRadius: 4.5, overflow: "hidden", backgroundColor: FONDO }, children: (nseCapa ?? []).map(
                  (s) => s.pct > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { width: `${s.pct}%`, backgroundColor: s.color } }, s.etiqueta)
                ) }) }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { width: wBarra }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { flexDirection: "row", height: 9, borderRadius: 4.5, overflow: "hidden", backgroundColor: FONDO }, children: (edadesCapa ?? []).map(
                  (s) => s.pct > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { width: `${s.pct}%`, backgroundColor: s.color } }, s.etiqueta)
                ) }) })
              ]
            },
            c.id
          );
        })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { flexDirection: "row" }, children: listaHallazgos.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flex: 1 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: labelCol, children: "HALLAZGOS" }),
        listaHallazgos.map((h, i) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          import_renderer2.View,
          {
            style: {
              backgroundColor: PANEL,
              borderLeftWidth: 2,
              borderLeftColor: [MAGENTA, VIOLETA, CIAN][i % 3],
              borderRadius: 6,
              paddingTop: 7,
              paddingBottom: 7,
              paddingLeft: 11,
              paddingRight: 11,
              marginBottom: 8
            },
            children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontSize: 8.5, color: TINTA, lineHeight: 1.45 }, children: h })
          },
          i
        ))
      ] }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { marginTop: 20, marginBottom: 24 }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Divisor, {}) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Seccion, { etiqueta: "Siguientes pasos", titulo: "Qu\xE9 se puede activar sobre este territorio" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }, children: tacticas.map((t) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      PillTactica,
      {
        clave: `proy-${t.clave}`,
        nombre: t.nombre,
        descriptor: t.descriptor,
        destacada: t.destacada
      },
      t.clave
    )) }),
    sustentos.map((s) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontSize: 8.5, color: GRIS, marginBottom: 4 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontWeight: 800, color: TINTA }, children: TACTICAS[s.clave].nombre }),
      " ",
      "\u2014 ",
      s.texto,
      "."
    ] }, s.clave)),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontSize: 10, color: TINTA, marginTop: 6 }, children: "El equipo de Gravity arma el plan de medios sobre este territorio." }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { width: CONT, marginTop: 34 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { alignItems: "center", marginBottom: 26, position: "relative" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Neon, { height: 110 }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { alignItems: "center", marginTop: 10 }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Marca, { size: 34 }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontWeight: 800, fontSize: 14, color: BLANCO, marginTop: 14 }, children: "De intenci\xF3n a visita." }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flexDirection: "row", marginTop: 8 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontWeight: 800, fontSize: 10, color: MAGENTA }, children: [
            "Conectamos",
            " "
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontWeight: 800, fontSize: 10, color: VIOLETA }, children: [
            "intenci\xF3n",
            " "
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontWeight: 800, fontSize: 10, color: CIAN }, children: "con visitas." })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(FooterTresCol, { fecha: fechaLarga })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.View, { style: { marginTop: 26, marginBottom: 12 }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Divisor, {}) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: { fontFamily: "DMMono", fontWeight: 500, fontSize: 7.5, letterSpacing: 2.2, color: GRIS_OSCURO, marginBottom: 10 }, children: "METODOLOG\xCDA \xB7 RESPALDO T\xC9CNICO DEL PROYECTO" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flexDirection: "row" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flex: 1, paddingRight: 24 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [labelCol, { fontSize: 6.5, marginBottom: 6 }], children: "FUENTES DE DATOS (TODOS LOS LEVANTAMIENTOS)" }),
        d.fuentes.map((f) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontSize: 7.5, color: GRIS, marginBottom: 3, lineHeight: 1.4 }, children: [
          "\xB7 ",
          f
        ] }, f)),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontSize: 7.5, color: GRIS_OSCURO, lineHeight: 1.5, marginTop: 6 }, children: [
          "Georreferenciaci\xF3n en lat/long WGS84 (EPSG:4326). Proyecto consolidado el ",
          fechaLarga,
          " con Seeker Planner, sobre",
          " ",
          fmt(d.nLevantamientos),
          " levantamientos. Deduplicaci\xF3n por identificador de lugar dentro de cada levantamiento."
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.View, { style: { flex: 1 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_renderer2.Text, { style: [labelCol, { fontSize: 6.5, marginBottom: 6 }], children: "UNIVERSOS Y TRASLAPES" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontSize: 7.5, color: GRIS, lineHeight: 1.5 }, children: [
          hayRural ? "Poblaci\xF3n urbana por interpolaci\xF3n areal de AGEBs (Censo 2020 INEGI) + poblaci\xF3n rural por localidad puntual (ITER 2020, localidades <2,500 hab)" : "Poblaci\xF3n por interpolaci\xF3n areal sobre AGEBs urbanas del Censo 2020 (INEGI)",
          ", contra la UNI\xD3N deduplicada de las geometr\xEDas de los levantamientos seleccionados: dos capas sobre la misma zona no cuentan a su poblaci\xF3n dos veces."
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_renderer2.Text, { style: { fontFamily: "Montserrat", fontSize: 7.5, color: GRIS_OSCURO, lineHeight: 1.5, marginTop: 6 }, children: [
          "Los traslapes entre capas se calculan por inclusi\xF3n-exclusi\xF3n \u2014 pob(A\u2229B) = pob(A) + pob(B) \u2212 pob(A\u222AB) \u2014 con las mismas sumas censales. El \xEDndice socioecon\xF3mico es un proxy censal (escolaridad, veh\xEDculos e internet por vivienda); no es NSE AMAI",
          hayRural ? " y considera solo la poblaci\xF3n urbana" : "",
          ". Los rangos de edad 25-64 se estiman con estructura nacional del Censo 2020."
        ] })
      ] })
    ] })
  ] }) });
}
function sanearDatosPlan(d) {
  const s = textoPdf;
  return {
    ...d,
    cliente: s(d.cliente),
    titulo: d.titulo ? s(d.titulo) : d.titulo,
    usuario: s(d.usuario),
    capas: d.capas.map((c) => ({
      ...c,
      nombre: s(c.nombre),
      pois: c.pois.map((p) => ({
        ...p,
        nombre: s(p.nombre),
        direccion: s(p.direccion)
      }))
    })),
    ooh: d.ooh ? {
      ...d.ooh,
      nombre: s(d.ooh.nombre),
      pantallas: d.ooh.pantallas.map((p) => ({
        ...p,
        nombre: s(p.nombre),
        pdvs: p.pdvs.map((r) => ({ ...r, nombre: s(r.nombre) }))
      })),
      sinCobertura: d.ooh.sinCobertura.map(s)
    } : d.ooh,
    detallePuntos: d.detallePuntos ? Object.fromEntries(
      Object.entries(d.detallePuntos).map(([id, filas]) => [
        id,
        filas.map((f) => ({
          ...f,
          nombre: s(f.nombre),
          ciudad: abreviarCiudad(f.ciudad)
        }))
      ])
    ) : d.detallePuntos,
    geoSeccion: d.geoSeccion ? {
      ...d.geoSeccion,
      nombre: s(d.geoSeccion.nombre),
      origen: s(d.geoSeccion.origen),
      municipios: d.geoSeccion.municipios.map((m) => ({
        ...m,
        municipio: s(m.municipio)
      }))
    } : d.geoSeccion
  };
}
function documentoPlanProyecto(datos) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ProyectoDocumento, { d: sanearDatosPlan(datos) });
}

// .test-pdf.tsx
var uni = {
  disponible: true,
  fuente: "Censo 2020 INEGI",
  criterio: "uni\xF3n deduplicada de 2 levantamientos",
  agebs: 320,
  residencial: { poblacion: 512e3, adultos18: 38e4, viviendas: 14e4 },
  perfil: {
    nseProxy: 54,
    nseDist: { ab: 12, c_mas: 18, c: 24, c_menos: 20, d_mas: 16, de: 10 },
    pct18a24: 14,
    pct60ymas: 12
  }
};
var poi = (i) => ({
  placeId: `p${i}`,
  nombre: `Suburbia ${i}`,
  direccion: `Av. Siempre Viva ${i}, Guadalajara`,
  lat: 20.67 + i * 0.01,
  lng: -103.35,
  distancia: 120,
  fuente: "google",
  cp: "44100"
});
(async () => {
  registrarFuentes(`${process.cwd()}/public`);
  const datos = {
    cliente: "Suburbia",
    titulo: "Plan de prueba V2",
    usuario: "Seeker",
    fecha: /* @__PURE__ */ new Date("2026-10-23"),
    consolidado: uni,
    sumaSimple: 42e4,
    nLevantamientos: 2,
    capas: [
      {
        id: "a",
        nombre: "Tiendas Suburbia",
        rol: "poi_propio",
        color: "#27b5e2",
        pois: Array.from({ length: 8 }, (_, i) => poi(i)),
        universo: uni
      }
    ],
    ooh: null,
    traslapes: [],
    mapaDataUrl: null,
    tacticas: ["poi", "targeting"],
    fuentes: ["Google Places API (New) \u2014 establecimientos"],
    universoRol: {},
    mapasRol: {},
    detallePuntos: {},
    geoTargeting: { cps: 485, keywords: 300 },
    geoSeccion: null
  };
  const buf = await (0, import_renderer3.renderToBuffer)(documentoPlanProyecto(datos));
  import_fs.default.writeFileSync(".test-salida.pdf", buf);
  const cabecera = buf.subarray(0, 5).toString();
  console.log("PDF:", cabecera, "\xB7", (buf.length / 1024).toFixed(0), "KB");
  if (cabecera !== "%PDF-") process.exit(1);
  console.log("TODO OK");
})().catch((e) => {
  console.error("FALLA:", e instanceof Error ? e.message : e);
  process.exit(1);
});
/*! Bundled license information:

react/cjs/react.production.min.js:
  (**
   * @license React
   * react.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react.development.js:
  (**
   * @license React
   * react.development.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react-jsx-runtime.production.min.js:
  (**
   * @license React
   * react-jsx-runtime.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react/cjs/react-jsx-runtime.development.js:
  (**
   * @license React
   * react-jsx-runtime.development.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
