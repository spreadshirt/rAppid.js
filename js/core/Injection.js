define(["js/core/Component"], function (Component) {


    function factoryInheritsFrom(factory, type) {
        return factory == type || factory.prototype instanceof type;
    }

    return Component.inherit("js.core.Injection", {
        ctor: function (attributes, descriptor, systemManager, parentScope, rootScope) {

            if (!systemManager.$injection) {
                this.callBase();
                this.$singletonInstanceCache = [];
                this.$factories = [];

                systemManager.$injection = this;
            }

            return systemManager.$injection;

        },

        _initializeChildren: function (childComponents) {
            this.callBase();
        },

        _childrenInitialized: function () {
            this.callBase();

            for (var c = 0; c < this.$configurations.length; c++) {
                var config = this.$configurations[c];

                if (config.className == "js.conf.Factory") {
                    this.addFactory(config.$);
                }
            }
        },

        getInstance: function (type) {
            // TODO: add class hierarchy distance check
            var instance;

            if (rAppid._.isString(type)) {
                // inject by key
                if (this.$singletonInstanceCache.hasOwnProperty(type)) {
                    return this.$singletonInstanceCache[type];
                }
            } else {
                // go to the singleton instance and look for requested instance
                for (var i = 0; i < this.$singletonInstanceCache.length; i++) {
                    instance = this.$singletonInstanceCache[i];

                    if (instance instanceof type) {
                        return instance;
                    }
                }

                // instance not found -> go thought the factories
                for (var f = 0; f < this.$factories.length; f++) {
                    var factory = this.$factories[f];

                    if (factoryInheritsFrom(factory.factory, type)) {
                        // create instance
                        instance = new factory.factory();

                        if (instance instanceof type) {
                            if (factory.singleton) {
                                this.addInstance(instance)
                            }

                            return instance;
                        }
                    }
                }
            }


            throw "requested injection type not found";
        },

        addChild: function (child) {
            this.callBase(child);

            this.addInstance(child);
        },

        addFactory: function (factory) {

            if (factory instanceof Function) {
                factory = {
                    factory: factory
                }
            }

            rAppid._.defaults(factory, {
                "type": null,
                "factory": null,
                "singleton": false
            });

            if (!factory.factory) {
                // get factory from class
                var fac = this.$systemManager.$applicationDomain.getDefinition(factory.type);
                if (!fac) {
                    throw "factory for type '" + factory.type + "' not found";
                }
                factory.factory = fac;
            }

            this.$factories.push(factory);
        },

        /***
         *
         * @param {String} [key] a unique key
         * @param instance
         */
        addInstance: function (key, instance) {
            if (arguments.length == 1) {
                instance = key;
                key = null;
            }

            if (instance instanceof Function) {
                throw "got a factory instead of an instance"
            }

            if (key) {
                this.$singletonInstanceCache[key] = instance;
            } else {
                this.$singletonInstanceCache.push(instance);
            }


        }
    });
});