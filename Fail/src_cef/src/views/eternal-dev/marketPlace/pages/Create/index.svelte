<script>
    import { createLot, setModalState } from "../../modules/functions";

    import UserInfo from "../../components/UserInfo/index.svelte";
    import StorageCard from "../Storage/StorageCard/index.svelte";
    import CreateCard from "./CreateCard/index.svelte";
    import CreateModal from "../../modals/CreateModal/index.svelte";

    import { calculatedColumnCount } from "../../modules/formats";

    let columnCount = calculatedColumnCount();

    export let items;

    let selectedItem = null;

    const setModal = (modalName) => {
        selectedItem = null
        setModalState(modalName)
    };

    const callbackCreateLot = (hours, paymentType, count, price) => {
        createLot(selectedItem, price, {
            hours,
            count,
            paymentType
        });

        setModal(null);
    };
</script>

<svelte:window on:resize={(e) => { columnCount = calculatedColumnCount(); }} />

{#if selectedItem != null && selectedItem.type != "item" && selectedItem.type != "clothes"}
    <CreateCard data={selectedItem} backFunction={() => selectedItem = null} isEditing={false} />
{:else}
    <div class="page-data create">
        {#if selectedItem != null && (selectedItem.type == "item" || selectedItem.type == "clothes")}
            <CreateModal setModal={setModal} type="item" data={selectedItem} callback={callbackCreateLot} />
        {/if}

        <div class="header">
            <div class="header__content">
                <div class="header__title">
                    Выберите товар для продажи
                </div>
            </div>

            <UserInfo />
        </div>

        <div class="content">
            <div class="list" style={"--column-count: " + columnCount}>
                <StorageCard data={{
                    id: -1,
                    type: "service",

                    params: {
                        name: "Создать объявление"
                    },
                }} type="create" onClick={() => selectedItem = {type: "service"}} />
                {#each items as item, index}
                    <StorageCard data={item} type="create" onClick={() => selectedItem = item} />
                {/each}
            </div>
        </div>
    </div>
{/if}