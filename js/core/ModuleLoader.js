define(["require", "js/html/HtmlElement", "js/ui/ContentPlaceHolder", "js/core/Module", "underscore", "js/conf/ModuleConfiguration", "flow"],
    function (require, HtmlElement, ContentPlaceHolder, Module, _, ModuleConfiguration, flow) {
        var ModuleLoader = HtmlElement.inherit("js.core.ModuleLoader", {

            $classAttributes: ['router', 'currentModuleName', 'state'],
            defaults: {
                currentModuleName:  null,
                tagName: 'div',
                componentClass: "module-loader",
                state: null
            },

            ctor: function (attributes) {
                this.callBase();
                this.$modules = {};
                this.$moduleCache = {};
            },

            _initializationComplete: function () {
                this.callBase();

                for (var i = 0; i < this.$configurations.length; i++) {
                    var config = this.$configurations[i];

                    if (config instanceof ModuleConfiguration) {
                        this.addModule(config.$);
                    }
                }
            },

            /***
             * adds a module to the list of known modules
             *
             * @param {js.conf.ModuleConfiguration} module
             */
            addModule: function (module) {
                _.defaults(module, {
                    name: null,
                    moduleClass: null,
                    route: null
                });

                if (!module.name) {
                    throw "module cannot be added: module name is required";
                }

                if (!module.moduleClass) {
                    throw "no moduleClass defined for module";
                }

                if (this.$modules.hasOwnProperty(module.name)) {
                    throw "module with name '" + module.name + "' already registered"
                }

                this.$modules[module.name] = module;

                if (module.route) {
                    if (!this.$.router) {
                        throw "defining modules with routes requires a router instance to be set"
                    }

                    var self = this;
                    this.$.router.addRoute({
                        name: module.name,
                        route: module.route,
                        fn: function (routeContext) {

                            // route triggered -> load module
                            self.loadModule(module, routeContext.callback, routeContext);
                        }.async()
                    });
                }

            },

            _startModule: function (moduleName, moduleInstance, callback, routeContext, cachedInstance) {

                var self = this;
                this.set('currentModuleName', moduleName);

                var contentPlaceHolders = this.getContentPlaceHolders();

                // set content
                for (var i = 0; i < contentPlaceHolders.length; i++) {
                    var contentPlaceHolder = contentPlaceHolders[i];
                    contentPlaceHolder.set("content", moduleInstance.findContent(contentPlaceHolder.$.name));
                }

                var internalCallback = function(err) {

                    self.set('state', err ? 'error' : null);

                    if (callback) {
                        callback(err, moduleInstance);
                    }
                };

                // start module
                moduleInstance.start(function (err) {

                    if (err || cachedInstance) {
                        internalCallback(err);
                    } else {
                        if (routeContext) {
                            // fresh instance with maybe new routers -> exec routes for new router
                            var routeExecutionStack = [];

                            for (var i = 0; i < moduleInstance.$routers.length; i++) {
                                routeExecutionStack = routeExecutionStack.concat(moduleInstance.$routers[i].generateRoutingStack(routeContext.fragment));
                            }

                            flow()
                                .seqEach(routeExecutionStack, function(routingFunction, cb) {
                                    routingFunction(cb);
                                })
                                .exec(internalCallback);

                        } else {
                            internalCallback();
                        }

                    }
                }, routeContext);

            },

            /***
             * loads an module instance into the module loader and starts the module
             *
             * @param {js.conf.ModuleConfiguration} module - the module to load
             * @param {Function} [callback] - a callback function which gets invoked after the module is loaded or an error occurred
             * @param {js.core.Router.RouteContext} [routeContext]
             */
            loadModule: function (module, callback, routeContext) {

                callback = callback || function() {};

                if (!module.hasOwnProperty("name")) {
                    // load by name
                    module = this.$modules[module];
                }

                if (!module) {
                    callback("module not found");
                }

                if (module.name === this.$.currentModuleName) {
                    // module already shown
                    if (callback) {
                        callback();
                    }
                } else {

                    this._clearContentPlaceHolders();
                    this.$lastModuleName = this.$.currentModuleName;
                    this.set('currentModuleName', null);
                    this.set('state', 'loading');

                    if (this.$moduleCache.hasOwnProperty(module.name)) {
                        this._startModule(module.name, this.$moduleCache[module.name], callback, routeContext, true);
                    } else {

                        var self = this;
                        // load module

                        require([this.$stage.$applicationContext.getFqClassName(module.moduleClass)], function (moduleBaseClass) {
                            var moduleInstance = new moduleBaseClass(null, false, self.$stage, null, null);

                            if (moduleInstance instanceof Module) {
                                if (typeof(CollectGarbage) == "function"){
                                    CollectGarbage();
                                }

                                moduleInstance._initialize("auto");

                                // cache instance
                                self.$moduleCache[module.name] = moduleInstance;

                                self._startModule(module.name, moduleInstance, callback, routeContext, false);

                            } else {
                                if (callback) {
                                    callback("Module '" + module.moduleClass + "' isn't an instance of js.core.Module");
                                }
                            }

                        }, function(err) {

                            self.set('state', 'error');
                            self.log(err, "warn");

                            if (callback) {
                                callback(err);
                            }
                        });
                    }
                }

            },
            isModuleActive: function (moduleName) {
                return this.$.currentModuleName == moduleName;
            }.onChange('currentModuleName'),

            _clearContentPlaceHolders: function() {

                var contentPlaceHolders = this.getContentPlaceHolders();

                // set content
                for (var i = 0; i < contentPlaceHolders.length; i++) {
                    var contentPlaceHolder = contentPlaceHolders[i];
                    contentPlaceHolder.set("content", null);
                }

            },

            // TODO: remove this method and make the modules bindable

            /***
             * @deprecated will be removed soon
             * @return {Array}
             */
            moduleNames: function(){
                var modules = [], conf;
                for(var i = 0; i < this.$configurations.length; i++){
                    conf = this.$configurations[i];
                    if(conf instanceof ModuleConfiguration){
                        modules.push(conf.$.name);
                    }
                }
                return modules;
            },

            _renderState: function(state, oldState) {
                oldState && this.removeClass(oldState);
                state && this.addClass(state);
            }
        });

        ModuleLoader.findContentPlaceHolders = function (component) {
            var ret = [];

            for (var i = 0; i < component.$children.length; i++) {
                var child = component.$children[i];
                if (child instanceof ContentPlaceHolder) {
                    ret.push(child);
                } else {
                    ret.concat(ModuleLoader.findContentPlaceHolders(child));
                }
            }

            return ret;

        };

        return ModuleLoader;
    });