<script>
    import {
        SORT_TYPES,
        BUSINESS_TYPES,
        PROPERTY_TYPES,
        VEHICLE_SHOWROOMS,
        ITEM_TYPES,
        CLOTHES_TYPES,
        GENDER_TYPES,
    } from "../../configs/sort";

    import { executeClient } from "api/rage";
    import Select from "../../components/Select/index.svelte";
    import UserInfo from "../../components/UserInfo/index.svelte";
    import Search from "../../components/Search/index.svelte";
    import MarketItem from "./MarketItem/index.svelte";
    import MarketCard from "./MarketCard/index.svelte";

    import { filterItems } from "../../modules/filter";
    import { getType, calculatedColumnCount, getName } from "../../modules/formats";
    import { charUUID } from "store/chars";

    import "./style.scss";
    import { marketSelectItem } from "../../modules/functions";

    export let items;
    export let currentCategory;

    let lastCategory = null;

    let columnCount = calculatedColumnCount(),
        currentSortType = null,
        currentSortId = "",
        currentSort = null,
        currentSubSort = null,

        selectedItem = null,
        currentItem = null,
        filteredItems = [];

    $: filteredItems 
        = currentCategory == "advertisements" ? items.filter(x => x.author.id == $charUUID) : filterItems(filterItems(
            filterItems(items, currentCategory, currentSortType),
            "sort",
            currentSort,
        ), currentCategory + "_sub", currentSubSort).filter(x => x != null)
        .filter(x => {
            let result = false;
            if (currentCategory == x.type)
                result = true;

            if (currentSortId != "") {
                var name = getName(x);
                return name.toLowerCase().includes(currentSortId.toLowerCase());
            }

            return result;
        });

    $: if (lastCategory != currentCategory) {
        currentSortType = null;
        currentSortId = null;
        currentSortId = "";
        selectedItem = null;
    }

    $: if (items && items.length) {
        currentItem = getSelectedItem(selectedItem);
    }

    const selectItem = (id) => {
        selectedItem = id;

        if (id != null) {
            const split = id.split("_");
            marketSelectItem(split[0], split[1])
        }
        else {
            marketSelectItem("", 0);
        }
    }

    const getSelectedItem = (array, id) => {
        if (id == null)
            return null;

        const split = id.split("_");
        return array.find(x => x.type == split[0] && (x.id == split[1] || x.itemId == split[1]));
    }

    $: currentItem = getSelectedItem(items, selectedItem);
</script>

<svelte:window on:resize={(e) => { columnCount = calculatedColumnCount(); }} />

{#if currentItem == null}
    <div class={`page-data ${currentCategory}`}>
        <div class="header">
            <div class="header__content">
                {#if currentCategory != "advertisements"}
                    {#if !["item", "service"].includes(currentCategory) }
                        <Select
                            icon="categories"
                            defaultText={currentCategory == "house"
                                ? "Тип недвижимости"
                                : currentCategory == "business"
                                ? "Тип бизнеса"
                                : currentCategory == "clothes" 
                                ? "Выбор типа одежды" 
                                : "Выбор автосалона"}
                            onClick={(type) => {
                                currentSortType = type;
                            }}
                            current={currentSortType}
                            options={currentCategory == "house"
                                ? PROPERTY_TYPES
                                : currentCategory == "business"
                                ? BUSINESS_TYPES
                                : currentCategory == "clothes" 
                                ? CLOTHES_TYPES 
                                : VEHICLE_SHOWROOMS}
                        />
                    {/if}
                    {#if currentCategory != "vehicle" && currentCategory != "clothes"}
                        <Search
                            placeholder={currentCategory == "business"
                                ? "Номер бизнеса" : currentCategory == "house" ?
                                "Номер недвижимости" : currentCategory == "service" ?
                                "Название услуги" : "Название предмета"}
                            value={currentSortId}
                            update={(val) => { currentSortId = val }}
                            maxlength={64}
                        />
                    {/if}
                    {#if currentCategory == "item"}
                        <Select
                            icon="categories"
                            defaultText="Выбор категории"
                            onClick={(type) => {
                                currentSortType = type;
                            }}
                            current={currentSortType}
                            options={ITEM_TYPES} 
                        />
                    {/if}
                    {#if currentCategory == "clothes"}
                        <Select
                            icon="gender"
                            defaultText="Гендер"
                            onClick={(type) => {
                                currentSubSort = type;
                            }}
                            current={currentSubSort}
                            options={GENDER_TYPES} 
                        />
                    {/if}
                    <Select
                        icon="sort"
                        defaultText="Сортировать"
                        onClick={(type) => {
                            currentSort = type;
                        }}
                        current={currentSort}
                        options={SORT_TYPES}
                    />
                {:else}
                    <div class="header__title">
                        Мои объявления
                    </div>
                {/if}
            </div>

            <UserInfo />
        </div>

        <div class="content">
            <div class="list" style={"--column-count: " + columnCount}>
                {#each filteredItems as item, index}
                    <MarketItem data={item} onClick={() => selectItem(`${item.type}_${item.id}`)} />
                {/each}
            </div>
        </div>
    </div>
{:else}
    <MarketCard data={currentItem} backFunction={() => selectItem(null)} />
{/if}